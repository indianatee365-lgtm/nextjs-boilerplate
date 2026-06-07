// SCAFFOLD: not implemented yet.
// When ready: generate a 6-digit OTP, store it hashed in profiles with an expiry,
// and send it via Twilio. Requires profiles.phone_verified (already added) and
// two new columns: phone_otp_hash text, phone_otp_expires_at timestamptz.
// See ROADMAP for full implementation plan.
import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json({ error: "Phone verification not yet implemented" }, { status: 501 })
}
