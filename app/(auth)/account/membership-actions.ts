"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { notifyOwner, getCustomerName } from "@/lib/observability/notify"
import { revalidatePath } from "next/cache"
import Stripe from "stripe"
import { sendCancellationConfirmation, sendReactivationConfirmation } from "@/lib/resend/email"
import { reinstateMembership } from "@/lib/membership/reinstate"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

// Why members cancel, asked in the cancel box (optional). Added 2026-10-08
// after both Birdie members ever sold cancelled within two minutes of joining
// and nobody knew why. Keep these in sync with REASONS in CancelMembershipSection.
const CANCEL_REASON_LABELS: Record<string, string> = {
  auto_renew: "just didn't want it to auto-renew",
  not_worth_it: "not worth it for how often they play",
  one_booking: "only needed it for one booking",
  mistake: "signed up by mistake",
  other: "something else",
}

const CANCEL_REASONS = new Set([
  "auto_renew", "not_worth_it", "one_booking", "mistake", "other",
])

export async function cancelMembership(
  reason?: { choice?: string; note?: string },
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const serviceClient = await createServiceClient()

  const { data: membership } = await serviceClient
    .from("memberships")
    .select("id, plan_type, stripe_subscription_id, cancellation_requested_at, current_period_end, founder_number, membership_plans(display_name, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!membership) return { error: "No active membership found" }

  const m = membership as {
    id: string
    plan_type: string
    stripe_subscription_id: string | null
    cancellation_requested_at: string | null
    current_period_end: string | null
    founder_number: number | null
    membership_plans: { display_name: string | null; name: string } | null
  }

  if (m.cancellation_requested_at) return { error: "Cancellation already requested" }
  if (!m.stripe_subscription_id) {
    await notifyOwner(`ALERT Cancel attempt FAILED, ${await getCustomerName(serviceClient, user.id)} has no subscription linked. Manual fix needed.`)
    return { error: "Subscription not found. Please contact support." }
  }

  try {
    await getStripe().subscriptions.update(m.stripe_subscription_id, { cancel_at_period_end: true })
  } catch (err) {
    await notifyOwner(`ALERT Stripe cancel FAILED, ${await getCustomerName(serviceClient, user.id)} sub=${m.stripe_subscription_id} err=${String(err).slice(0, 200)}`)
    return { error: "Could not cancel. Please contact support." }
  }

  await serviceClient
    .from("memberships")
    .update({ cancellation_requested_at: new Date().toISOString() })
    .eq("id", m.id)

  const choice = reason?.choice && CANCEL_REASONS.has(reason.choice) ? reason.choice : null
  const note = typeof reason?.note === "string" ? reason.note.trim().slice(0, 500) : ""
  if (choice || note) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (serviceClient as any).from("memberships")
      .update({ cancellation_reason: choice, cancellation_note: note || null })
      .eq("id", m.id)
  }
  const reasonText = [CANCEL_REASON_LABELS[choice ?? ""] ?? null, note ? `"${note}"` : null].filter(Boolean).join(", ")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient as any).from("admin_logs").insert({
    event: "membership-cancel-requested",
    detail: `user=${user.id} plan=${m.plan_type} sub=${m.stripe_subscription_id} end=${m.current_period_end ?? "?"}`,
  })

  const planName = m.membership_plans?.display_name ?? m.membership_plans?.name ?? m.plan_type
  const endDate = m.current_period_end
    ? new Date(m.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
    : "the end of your current period"

  await Promise.allSettled([
    (async () => {
      const { data: prof } = await serviceClient.from("profiles").select("first_name").eq("id", user.id).single()
      const firstName = (prof as { first_name: string } | null)?.first_name ?? "there"
      if (user.email) {
        await sendCancellationConfirmation({
          to: user.email, firstName, planName, endDate,
          isFounder: m.plan_type === "founder",
          founderNumber: m.founder_number,
        })
      }
    })(),
    (async () => {
      const custName = await getCustomerName(serviceClient, user.id)
      await notifyOwner(`Cancellation requested, ${planName} ${custName}. Active until ${endDate}. Reason: ${reasonText || "not given"}.`)
    })(),
  ])

  revalidatePath("/account")
  return { ok: true }
}

/**
 * Restore a membership that has actually lapsed: Stripe deleted the
 * subscription and status is 'cancelled'. Distinct from reactivateMembership()
 * below, which only un-schedules a cancellation that has not taken effect yet.
 *
 * Self-serve because the cancel dialog promises exactly this ("you can
 * reactivate any time at your original Founder's terms: same discount, same
 * booking window, same number") and because nothing is being given away: the
 * joining fee on the row they are restoring is already marked paid. The
 * heavy lifting, including the reinstate_blocked check, is in
 * lib/membership/reinstate.ts.
 */
export async function restoreMembership(): Promise<{ error?: string; ok?: boolean; message?: string; needsCard?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const serviceClient = await createServiceClient()
  const result = await reinstateMembership(serviceClient, {
    userId: user.id,
    selfServe: true,
    actorLabel: "self-serve",
  })

  if (!result.ok) return { error: result.message, needsCard: result.needsCard }

  revalidatePath("/account")
  return { ok: true, message: result.message }
}

export async function reactivateMembership(): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const serviceClient = await createServiceClient()

  const { data: membership } = await serviceClient
    .from("memberships")
    .select("id, plan_type, status, stripe_subscription_id, cancellation_requested_at, founder_number, membership_plans(display_name, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!membership) return { error: "No membership found to reactivate" }

  const m = membership as {
    id: string
    plan_type: string
    status: string
    stripe_subscription_id: string | null
    cancellation_requested_at: string | null
    founder_number: number | null
    membership_plans: { display_name: string | null; name: string } | null
  }

  if (!m.cancellation_requested_at) return { error: "Your membership is already active" }
  if (!m.stripe_subscription_id) return { error: "Subscription not found. Please contact support." }

  try {
    await getStripe().subscriptions.update(m.stripe_subscription_id, { cancel_at_period_end: false })
  } catch (err) {
    await notifyOwner(`ALERT Stripe reactivate FAILED, ${await getCustomerName(serviceClient, user.id)} sub=${m.stripe_subscription_id} err=${String(err).slice(0, 200)}`)
    return { error: "Could not reactivate. Please contact support." }
  }

  await serviceClient
    .from("memberships")
    .update({ cancellation_requested_at: null })
    .eq("id", m.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (serviceClient as any).from("admin_logs").insert({
    event: "membership-reactivated",
    detail: `user=${user.id} plan=${m.plan_type} sub=${m.stripe_subscription_id}`,
  })

  const planName = m.membership_plans?.display_name ?? m.membership_plans?.name ?? m.plan_type

  await Promise.allSettled([
    (async () => {
      const { data: prof } = await serviceClient.from("profiles").select("first_name").eq("id", user.id).single()
      const firstName = (prof as { first_name: string } | null)?.first_name ?? "there"
      if (user.email) {
        await sendReactivationConfirmation({
          to: user.email, firstName, planName,
          isFounder: m.plan_type === "founder",
          founderNumber: m.founder_number,
        })
      }
    })(),
    (async () => {
      const custName = await getCustomerName(serviceClient, user.id)
      await notifyOwner(`Reactivated, ${planName} ${custName}. Cancellation cancelled.`)
    })(),
  ])

  revalidatePath("/account")
  return { ok: true }
}
