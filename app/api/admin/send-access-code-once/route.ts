import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { grantBayAccess } from "@/lib/access-control"
import { sendAccessCodeReminder } from "@/lib/telnyx/sms"
import { logEvent, logFailure } from "@/lib/observability/notify"

// TEMPORARY, one-off: manually sends the access-code SMS for a single
// booking, bypassing booking-reminders' 30-min window (10 min back / 20 min
// forward from cron run time). Needed 2026-08-24 because a test booking's
// customer flipped sms_consent to true a few minutes after the booking
// started, and by the time consent caught up the booking had already aged
// past the cron's lookback window with no retry path. Delete after use.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { bookingId } = await request.json()
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, access_code, bays(name), profiles!user_id(first_name, phone, sms_consent)")
    .eq("id", bookingId)
    .single()

  if (error || !booking) return NextResponse.json({ error: "booking not found" }, { status: 404 })

  const profile = booking.profiles as unknown as { first_name: string; phone: string | null; sms_consent: boolean } | null
  const bay = booking.bays as unknown as { name: string } | null

  if (!profile?.phone || !profile.sms_consent || !bay) {
    return NextResponse.json({ error: "missing phone, sms consent, or bay", profile, bay }, { status: 400 })
  }

  try {
    const { pinCode, userId, accessPolicyId, scheduleId } = await grantBayAccess({
      bookingId: booking.id,
      firstName: profile.first_name,
      phone: profile.phone,
      bayName: bay.name,
      startsAt: new Date(booking.starts_at),
      endsAt: new Date(booking.ends_at),
    })

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

    await sendAccessCodeReminder({
      to: profile.phone,
      firstName: profile.first_name,
      bayName: bay.name,
      accessCode: pinCode,
      startsAt: new Date(booking.starts_at),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString(), access_sent_at: new Date().toISOString() })
      .eq("id", booking.id)

    await logEvent(supabase, "access-code-sent-manual", `booking=${booking.id} to=${profile.phone}`)
    return NextResponse.json({ ok: true, pinCode })
  } catch (err) {
    await logFailure(supabase, "access-code-MANUAL-FAILED",
      `booking=${booking.id} to=${profile.phone} err=${String(err).slice(0, 200)}`,
      `Manual access-code send failed for booking=${booking.id}`)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
