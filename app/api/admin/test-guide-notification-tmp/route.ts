import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendBookingConfirmation } from "@/lib/telnyx/sms"
import { sendBookingConfirmationEmail } from "@/lib/resend/email"

// TEMPORARY - sends a real sample booking-confirmation SMS + email (with the
// tee365.org/guide link) to whichever admin is logged in when they hit this,
// using Bay 1 sample pricing. Not a real booking, no DB writes - just fires
// the two actual notification functions so Jerrod can visually confirm the
// guide link renders correctly, from his own phone/email, without being
// onsite. Delete this route once confirmed (2026-08-30).
export async function GET() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 })

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role, first_name, phone, sms_consent")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const startsAt = new Date(Date.now() + 30 * 60 * 1000)
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)
  const firstName = profile.first_name || "Jerrod"
  const sent: string[] = []
  const skipped: string[] = []

  if (profile.phone && profile.sms_consent) {
    await sendBookingConfirmation({ to: profile.phone, firstName, bayName: "Bay 1", startsAt, endsAt })
    sent.push(`sms to ${profile.phone}`)
  } else {
    skipped.push(profile.phone ? "sms (no consent)" : "sms (no phone on profile)")
  }

  if (user.email) {
    await sendBookingConfirmationEmail({
      to: user.email,
      firstName,
      bayName: "Bay 1",
      startsAt,
      endsAt,
      subtotal: 35,
      membershipDiscount: 0,
      couponDiscount: 0,
      tax: 2.45,
      giftCardApplied: 0,
      total: 37.45,
      hourCreditDiscount: 0,
    })
    sent.push(`email to ${user.email}`)
  } else {
    skipped.push("email (no address)")
  }

  return NextResponse.json({ ok: true, sent, skipped })
}
