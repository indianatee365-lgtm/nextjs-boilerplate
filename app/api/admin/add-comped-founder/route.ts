import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendFounderConfirmationEmail } from "@/lib/resend/email"

// TEMPORARY - one-off admin action to comp a founder membership (no Stripe
// subscription) for someone added manually, e.g. after enrollment closed.
// Delete after use.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return raw.startsWith("+") ? raw : "+" + raw
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user: caller } } = await supabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: callerProfile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single()
  if ((callerProfile as { role: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { email, phone: rawPhone, firstName, lastName } = body as {
    email: string; phone: string; firstName: string; lastName: string
  }
  const phone = normalizePhone(rawPhone)
  const steps: Record<string, string> = {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = (serviceClient as any).auth.admin

  // 1. Create the auth user + profile (trigger handle_new_user reads
  // raw_user_meta_data for first_name/last_name/phone).
  const { data: created, error: createErr } = await admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName, phone },
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: "createUser failed: " + createErr?.message }, { status: 500 })
  }
  const userId = created.user.id
  steps.account = "created " + userId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  await db.from("profiles").update({ sms_consent: true, phone_verified: true }).eq("id", userId)
  steps.profile = "sms_consent enabled"

  // 2. Founder membership - comped, no Stripe.
  const { data: maxRow } = await db
    .from("memberships")
    .select("founder_number")
    .eq("plan_type", "founder")
    .order("founder_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  const founderNumber = (maxRow?.founder_number ?? 0) + 1

  const { error: memErr } = await db.from("memberships").insert({
    user_id: userId,
    plan_id: "51dc00bd-8731-4e62-a2f2-b90f8dd1b402",
    plan_type: "founder",
    status: "active",
    founder_number: founderNumber,
    joining_fee_paid: true,
    started_at: new Date().toISOString(),
  })
  if (memErr) return NextResponse.json({ error: "membership insert failed: " + memErr.message, steps }, { status: 500 })
  steps.membership = "founder #" + founderNumber + " active, comped"

  // 3. Founders Day free hours, same as every other founder.
  const { error: creditErr } = await db.from("hour_credits").insert({
    user_id: userId,
    hours: 2,
    hours_remaining: 2,
    reason: "Founders Day 2026",
    active: true,
    expires_at: null,
    created_by: caller.id,
  })
  if (creditErr) return NextResponse.json({ error: "hour_credits insert failed: " + creditErr.message, steps }, { status: 500 })
  steps.hourCredit = "2 hours granted, no expiration"

  // 4. Welcome email (normally fires from the Stripe webhook on signup;
  // this bypasses that, so send it explicitly).
  try {
    await sendFounderConfirmationEmail({ to: email, firstName, founderNumber })
    steps.welcomeEmail = "sent to " + email
  } catch (e) {
    steps.welcomeEmail = "FAILED: " + String(e).slice(0, 300)
  }

  return NextResponse.json({ ok: true, userId, founderNumber, steps })
}
