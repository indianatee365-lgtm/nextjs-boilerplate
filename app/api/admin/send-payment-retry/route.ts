import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"
import { sendPaymentRetrySms } from "@/lib/telnyx/sms"
import { sendPaymentRetryEmail } from "@/lib/resend/email"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

export async function POST(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, channel, planName, amount } = await request.json()
  if (!userId || !channel || !planName || !amount) {
    return NextResponse.json({ error: "userId, channel, planName, and amount are required" }, { status: 400 })
  }
  if (!["sms", "email", "both"].includes(channel)) {
    return NextResponse.json({ error: "channel must be sms, email, or both" }, { status: 400 })
  }

  const serviceClient = await createServiceClient()
  const [{ data: profile }, { data: authUserRes }] = await Promise.all([
    serviceClient.from("profiles").select("first_name, phone, sms_consent").eq("id", userId).single(),
    serviceClient.auth.admin.getUserById(userId),
  ])

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })
  const email = authUserRes?.user?.email ?? null

  const sent: string[] = []
  const skipped: string[] = []

  if (channel === "sms" || channel === "both") {
    if (profile.phone && profile.sms_consent) {
      await sendPaymentRetrySms({ to: profile.phone, firstName: profile.first_name, planName, amount })
      sent.push("sms")
    } else {
      skipped.push(profile.phone ? "sms (no consent)" : "sms (no phone)")
    }
  }

  if (channel === "email" || channel === "both") {
    if (email) {
      await sendPaymentRetryEmail({ to: email, firstName: profile.first_name, planName, amount })
      sent.push("email")
    } else {
      skipped.push("email (no address)")
    }
  }

  await logEvent(serviceClient, "payment-retry-sent",
    `user=${userId} sent=${sent.join(",") || "none"} skipped=${skipped.join(",") || "none"} plan=${planName} amount=$${amount}`)

  return NextResponse.json({ ok: true, sent, skipped })
}
