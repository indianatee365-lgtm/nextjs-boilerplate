import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendAccessCodeReminder } from "@/lib/telnyx/sms"
import { sendAccessCodeEmail } from "@/lib/resend/email"
import { grantBayAccess } from "@/lib/access-control"
import { logEvent, logFailure } from "@/lib/observability/notify"

export const runtime = "nodejs"


export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const now = new Date()
  // Backward tail catches last-minute bookings the cron previously missed
  const windowStart = new Date(now.getTime() - 10 * 60 * 1000)  // 10 min ago
  const windowEnd = new Date(now.getTime() + 20 * 60 * 1000)    // 20 min from now

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id, user_id, starts_at, ends_at,
      bays(name),
      profiles!user_id(first_name, last_name, phone, sms_consent)
    `)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .is("access_code", null)
    .gte("starts_at", windowStart.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .gt("ends_at", now.toISOString())

  if (error) {
    console.error("[cron/booking-reminders] query error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; sent: boolean; error?: string }[] = []

  for (const booking of bookings ?? []) {
    const profile = booking.profiles as { first_name: string; last_name: string | null; phone: string | null; sms_consent: boolean } | null
    const bay = booking.bays as { name: string } | null

    // grantBayAccess() never actually uses `phone` internally, so
    // generation only needs a bay to grant access to - it was gated on
    // sms_consent here purely by accident, which silently left anyone who
    // declined SMS with no door code through any channel, and no alert
    // telling anyone that happened. Only the delivery channel (SMS vs
    // email) depends on consent now.
    if (!bay) {
      results.push({ id: booking.id, sent: false, error: "missing bay" })
      continue
    }
    const smsEligible = !!(profile?.phone && profile.sms_consent)

    try {
      const { pinCode, userId, accessPolicyId, scheduleId } = await grantBayAccess({
        bookingId: booking.id,
        firstName: profile?.first_name ?? "Customer",
        lastName:  profile?.last_name ?? undefined,
        phone:     profile?.phone ?? "",
        bayName:   bay.name,
        startsAt:  new Date(booking.starts_at),
        endsAt:    new Date(booking.ends_at),
      })

      // Persist the access code
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("bookings")
        .update({
          access_code: pinCode,
          unifi_visitor_id: userId,
          unifi_access_policy_id: accessPolicyId,
          unifi_schedule_id: scheduleId,
        })
        .eq("id", booking.id)

      let deliveredTo: string | null = null
      if (smsEligible) {
        await sendAccessCodeReminder({
          to: profile!.phone!,
          firstName: profile!.first_name,
          bayName: bay.name,
          accessCode: pinCode,
          startsAt: new Date(booking.starts_at),
        })
        deliveredTo = profile!.phone!
      } else {
        const { data: authUserRes } = await supabase.auth.admin.getUserById(booking.user_id)
        const email = authUserRes?.user?.email
        if (email) {
          await sendAccessCodeEmail({
            to: email,
            firstName: profile?.first_name ?? "there",
            bayName: bay.name,
            accessCode: pinCode,
            startsAt: new Date(booking.starts_at),
          })
          deliveredTo = email
        }
      }

      // Mark reminder sent
      await supabase
        .from("bookings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ reminder_sent_at: new Date().toISOString(), access_sent_at: new Date().toISOString() } as any)
        .eq("id", booking.id)

      results.push({ id: booking.id, sent: !!deliveredTo })
      if (deliveredTo) {
        await logEvent(supabase, "access-code-sent-cron", `booking=${booking.id} channel=${smsEligible ? "sms" : "email"} to=${deliveredTo}`)
      } else {
        // Code was generated and saved (visible on the account page either
        // way) but there was no phone AND no email to push it to - genuinely
        // rare, worth a human looking at rather than dying silently.
        await logFailure(supabase, "access-code-NO-CHANNEL",
          `booking=${booking.id} - code generated but no phone/consent and no account email to deliver it to`,
          `ALERT booking=${booking.id} has an access code but no way to deliver it (no phone/consent, no account email). Customer may not know their code.`)
      }
    } catch (err) {
      results.push({ id: booking.id, sent: false, error: String(err) })
      await logFailure(supabase, "access-code-CRON-FAILED",
        `booking=${booking.id} starts_at=${booking.starts_at} err=${String(err).slice(0, 200)}`,
        `ALERT Access code FAILED (cron), booking=${booking.id} session at ${new Date(booking.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}. Customer may be locked out. CALL THEM.`)
    }
  }

  const failed = results.filter(r => !r.sent).length
  await logEvent(supabase, failed > 0 ? "booking-reminders-cron-PARTIAL" : "booking-reminders-cron-ok",
    `processed=${results.length} sent=${results.length - failed} failed=${failed}`)

  return NextResponse.json({ processed: results.length, results })
}
