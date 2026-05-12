// SCAFFOLD — not implemented yet.
// When ready: compare submitted OTP against stored hash, check expiry,
// and set profiles.phone_verified = true on match.
// See ROADMAP for full implementation plan.
import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json({ error: "Phone verification not yet implemented" }, { status: 501 })
}
