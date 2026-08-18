import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"
import { sendSubscriptionPastDueSms } from "@/lib/telnyx/sms"
import { sendSubscriptionPastDueEmail } from "@/lib/resend/email"
import { PLAN_DISPLAY_NAMES } from "@/lib/membership/first-year"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

// Manual one-off resend of the subscription-past-due customer notice - for
// members whose subscription transitioned to past_due before the automatic
// notice existed (or if a send genuinely failed and needs retrying), since
// the webhook only fires it on a fresh active->past_due transition and
// won't re-fire on an unchanged status.
export async function POST(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, channel } = await request.json()
  if (!userId || !channel) {
    return NextResponse.json({ error: "userId and channel are required" }, { status: 400 })
  }
  if (!["sms", "email", "both"].includes(channel)) {
    return NextResponse.json({ error: "channel must be sms, email, or both" }, { status: 400 })
  }

  const serviceClient = await createServiceClient()
  const [{ data: profile }, { data: authUserRes }, { data: membership }] = await Promise.all([
    serviceClient.from("profiles").select("first_name, phone, sms_consent").eq("id", userId).single(),
    serviceClient.auth.admin.getUserById(userId),
    serviceClient.from("memberships").select("plan_type").eq("user_id", userId).eq("status", "past_due").maybeSingle(),
  ])

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (!membership) return NextResponse.json({ error: "No past_due membership found for this user" }, { status: 404 })

  const email = authUserRes?.user?.email ?? null
  const planType = (membership as { plan_type: string }).plan_type
  const planDisplayName = PLAN_DISPLAY_NAMES[planType] ?? planType

  const sent: string[] = []
  const skipped: string[] = []

  if (channel === "sms" || channel === "both") {
    if (profile.phone && profile.sms_consent) {
      await sendSubscriptionPastDueSms({ to: profile.phone, firstName: profile.first_name, planDisplayName })
      sent.push("sms")
    } else {
      skipped.push(profile.phone ? "sms (no consent)" : "sms (no phone)")
    }
  }

  if (channel === "email" || channel === "both") {
    if (email) {
      await sendSubscriptionPastDueEmail({ to: email, firstName: profile.first_name, planDisplayName })
      sent.push("email")
    } else {
      skipped.push("email (no address)")
    }
  }

  await logEvent(serviceClient, "subscription-past-due-manual-resend",
    `user=${userId} sent=${sent.join(",") || "none"} skipped=${skipped.join(",") || "none"} plan=${planType}`)

  return NextResponse.json({ ok: true, sent, skipped })
}
