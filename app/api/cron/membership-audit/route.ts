import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

async function notifyOwner(msg: string) {
  await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.TELNYX_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.TELNYX_PHONE_NUMBER, to: "+15749990622", text: msg }),
  }).catch(() => {})
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const stripe = getStripe()
  const drifts: string[] = []

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, user_id, plan_type, status, stripe_customer_id, stripe_subscription_id, current_period_end")
    .in("status", ["active", "past_due"])

  const all = (memberships ?? []) as Array<{
    id: string
    user_id: string
    plan_type: string
    status: string
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    current_period_end: string | null
  }>

  for (const m of all) {
    if (!m.stripe_subscription_id) {
      drifts.push(`user=${m.user_id} ${m.plan_type} NO_SUB_LINKED`)
      continue
    }

    try {
      const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id) as unknown as Stripe.Subscription & { current_period_end?: number }

      if ((sub.status === "canceled" || sub.status === "incomplete_expired") && m.status === "active") {
        drifts.push(`user=${m.user_id} ${m.plan_type} STRIPE=${sub.status} DB=${m.status}`)
        continue
      }

      if (sub.status === "past_due" && m.status === "active") {
        drifts.push(`user=${m.user_id} ${m.plan_type} STRIPE=past_due DB=active`)
        continue
      }

      const stripeEnd = sub.current_period_end ?? (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end
      if (stripeEnd && m.current_period_end) {
        const stripeMs = stripeEnd * 1000
        const dbMs = new Date(m.current_period_end).getTime()
        if (Math.abs(stripeMs - dbMs) > 24 * 60 * 60 * 1000) {
          drifts.push(`user=${m.user_id} ${m.plan_type} PERIOD_MISMATCH stripe=${new Date(stripeMs).toISOString().slice(0,10)} db=${m.current_period_end.slice(0,10)}`)
        }
      }
    } catch (err) {
      drifts.push(`user=${m.user_id} ${m.plan_type} SUB_LOOKUP_FAILED sub=${m.stripe_subscription_id} err=${String(err).slice(0, 100)}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("admin_logs").insert({
    event: drifts.length === 0 ? "membership-audit-healthy" : "membership-audit-drift",
    detail: drifts.length === 0
      ? `${all.length} memberships checked, all healthy`
      : `${drifts.length} drift(s): ${drifts.slice(0, 5).join(" | ")}`,
  })

  if (drifts.length > 0) {
    await notifyOwner(`ALERT Membership audit: ${drifts.length} drift(s) detected. Check admin_logs.`)
  } else if (all.length > 0) {
    await notifyOwner(`Membership audit: ${all.length} active, all healthy.`)
  }

  return NextResponse.json({ checked: all.length, drifts: drifts.length, details: drifts })
}
