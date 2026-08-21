import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// TEMPORARY - creates a disposable non-founder test account with a known
// password, to verify the Friends Day guest-coupon gate end to end without
// using an admin session (which bypasses the gate entirely). Delete after.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: callerProfile } = await serviceClient.from("profiles").select("role").eq("id", caller.id).single()
  if ((callerProfile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email, password } = await request.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = (serviceClient as any).auth.admin
  const { data: created, error } = await admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: "Friend", last_name: "Tester", phone: "+15551234567" },
  })
  if (error || !created?.user) {
    return NextResponse.json({ error: "createUser failed: " + error?.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId: created.user.id })
}
