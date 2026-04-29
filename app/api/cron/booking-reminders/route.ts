import { NextRequest, NextResponse } from "next/server"
import { randomInt } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { sendAccessCodeReminder } from "@/lib/twilio/sms"
import { grantBayAccess } from "@/lib/access-control"

export const runtime = "nodejs"

function generateAccessCode(): string {
  return String(randomInt(100000, 1000000))
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  const now = new Date()
  const windowStart = new Date(now.getTime() + 10 * 60 * 1000)  // 10 min from now
  const windowEnd = new Date(now.getTime() + 20 * 60 * 1000)    // 20 min from now

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(`
      id, starts_at, ends_at,
      bays(name),
      profiles!user_id(first_name, phone)
    `)
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .is("access_code", null)
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

    if (!profile?.phone || !bay) {
      results.push({ id: booking.id, sent: false, error: "missing phone or bay" })
      continue
    }

    const accessCode = generateAccessCode()

    try {
      // Persist the access code
      await supabase
        .from("bookings")
        .update({ access_code: accessCode })
        .eq("id", booking.id)

      // SMS the customer
      await sendAccessCodeReminder({
        to: profile.phone,
        firstName: profile.first_name,
        bayName: bay.name,
        accessCode,
        startsAt: new Date(booking.starts_at),
      })

      // Send to access control system
      await grantBayAccess({
        accessCode,
        bayName: bay.name,
        startsAt: new Date(booking.starts_at),
        endsAt: new Date(booking.ends_at),
      })

      // Mark reminder sent
      await supabase
        .from("bookings")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ reminder_sent_at: new Date().toISOString(), access_sent_at: new Date().toISOString() } as any)
        .eq("id", booking.id)

      results.push({ id: booking.id, sent: true })
    } catch (err) {
      console.error("[cron/booking-reminders] failed for booking", booking.id, err)
      results.push({ id: booking.id, sent: false, error: String(err) })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
