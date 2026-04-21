import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendAccessCodeReminder } from "@/lib/twilio/sms"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  // Vercel cron auth
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const now = new Date()
  const windowStart = new Date(now.getTime() + 10 * 60 * 1000)  // 10 min from now
  const windowEnd = new Date(now.getTime() + 20 * 60 * 1000)    // 20 min from now

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id, starts_at, access_code,
      bays(name),
      profiles!user_id(first_name, phone)
    `)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .gte("starts_at", windowStart.toISOString())
    .lte("starts_at", windowEnd.toISOString())

  if (error) {
    console.error("[cron/booking-reminders] query error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; sent: boolean; error?: string }[] = []

  for (const booking of bookings ?? []) {
    const profile = booking.profiles as { first_name: string; phone: string | null } | null
    const bay = booking.bays as { name: string } | null

    if (!profile?.phone || !bay || !booking.access_code) {
      results.push({ id: booking.id, sent: false, error: "missing phone, bay, or access code" })
      continue
    }

    try {
      await sendAccessCodeReminder({
        to: profile.phone,
        firstName: profile.first_name,
        bayName: bay.name,
        accessCode: booking.access_code,
        startsAt: new Date(booking.starts_at),
      })

      await supabase
        .from("bookings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ reminder_sent_at: new Date().toISOString() } as any)
        .eq("id", booking.id)

      results.push({ id: booking.id, sent: true })
    } catch (err) {
      console.error("[cron/booking-reminders] SMS failed", booking.id, err)
      results.push({ id: booking.id, sent: false, error: String(err) })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
