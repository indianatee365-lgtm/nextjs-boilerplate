import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"
import { sendSubscriptionCancelledSms, buildSubscriptionCancelledSmsBody } from "@/lib/telnyx/sms"
import { sendSubscriptionCancelledEmail } from "@/lib/resend/email"
import { PLAN_DISPLAY_NAMES } from "@/lib/membership/first-year"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

// Manual one-off send of the membership-ended notice. The webhook only fires
// it on a fresh transition into cancelled, so anyone whose subscription was
// deleted before that notice existed never got one - Jeremy Bonk (cancelled
// 2026-09-13) being the case that prompted writing it.
//
// preview=true renders the exact copy without sending anything, so the message
// can be read before it goes to a real customer.
export async function POST(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, channel, preview } = await request.json()
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
    serviceClient
      .from("memberships")
      .select("plan_type, founder_number")
      .eq("user_id", userId)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (!membership) return NextResponse.json({ error: "No cancelled membership found for this user" }, { status: 404 })

  const email = authUserRes?.user?.email ?? null
  const { plan_type: planType, founder_number: founderNumber } =
    membership as { plan_type: string; founder_number: number | null }
  const planDisplayName = PLAN_DISPLAY_NAMES[planType] ?? planType
  const isFounder = planType === "founder"

  if (preview === true) {
    const smsBody = buildSubscriptionCancelledSmsBody({
      firstName: profile.first_name, planDisplayName, isFounder,
    })
    return NextResponse.json({
      ok: true,
      preview: true,
      to: { phone: profile.phone, email, smsConsent: profile.sms_consent },
      plan: planDisplayName,
      isFounder,
      founderNumber,
      smsBody,
      emailSubject: `Your Tee365 ${planDisplayName} membership has ended`,
    })
  }

  const sent: string[] = []
  const skipped: string[] = []

  if (channel === "sms" || channel === "both") {
    if (profile.phone && profile.sms_consent) {
      await sendSubscriptionCancelledSms({ to: profile.phone, firstName: profile.first_name, planDisplayName, isFounder })
      sent.push("sms")
    } else {
      skipped.push(profile.phone ? "sms (no consent)" : "sms (no phone)")
    }
  }

  if (channel === "email" || channel === "both") {
    if (email) {
      await sendSubscriptionCancelledEmail({ to: email, firstName: profile.first_name, planDisplayName, isFounder, founderNumber })
      sent.push("email")
    } else {
      skipped.push("email (no address)")
    }
  }

  await logEvent(serviceClient, "subscription-cancelled-manual-send",
    `user=${userId} sent=${sent.join(",") || "none"} skipped=${skipped.join(",") || "none"} plan=${planType}`)

  return NextResponse.json({ ok: true, sent, skipped })
}
