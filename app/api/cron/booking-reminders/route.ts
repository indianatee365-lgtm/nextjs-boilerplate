import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendAccessCodeReminder } from "@/lib/telnyx/sms"
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
      id, starts_at, ends_at,
      bays(name),
      profiles!user_id(first_name, phone, sms_consent)
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
    const profile = booking.profiles as { first_name: string; phone: string | null; sms_consent: boolean } | null
    const bay = booking.bays as { name: string } | null

    if (!profile?.phone || !profile.sms_consent || !bay) {
      results.push({ id: booking.id, sent: false, error: "missing phone, sms consent, or bay" })
      continue
    }

    try {
      const { pinCode, userId, accessPolicyId, scheduleId } = await grantBayAccess({
        bookingId: booking.id,
        firstName: profile.first_name,
        phone:     profile.phone,
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

      // SMS the customer
      await sendAccessCodeReminder({
        to: profile.phone,
        firstName: profile.first_name,
        bayName: bay.name,
        accessCode: pinCode,
        startsAt: new Date(booking.starts_at),
      })

      // Mark reminder sent
      await supabase
        .from("bookings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ reminder_sent_at: new Date().toISOString(), access_sent_at: new Date().toISOString() } as any)
        .eq("id", booking.id)

      results.push({ id: booking.id, sent: true })
      await logEvent(supabase, "access-code-sent-cron", `booking=${booking.id} to=${profile.phone}`)
    } catch (err) {
      results.push({ id: booking.id, sent: false, error: String(err) })
      await logFailure(supabase, "access-code-CRON-FAILED",
        `booking=${booking.id} to=${profile.phone} starts_at=${booking.starts_at} err=${String(err).slice(0, 200)}`,
        `ALERT Access code FAILED (cron), booking=${booking.id} session at ${new Date(booking.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}. Customer may be locked out. CALL THEM.`)
    }
  }

  const failed = results.filter(r => !r.sent).length
  await logEvent(supabase, failed > 0 ? "booking-reminders-cron-PARTIAL" : "booking-reminders-cron-ok",
    `processed=${results.length} sent=${results.length - failed} failed=${failed}`)

  return NextResponse.json({ processed: results.length, results })
}
