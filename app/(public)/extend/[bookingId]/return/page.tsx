import { redirect } from "next/navigation"
import { finalizeExtend } from "../actions"

// Stripe redirects here after 3DS authentication for extend payments.
// Stripe appends: ?payment_intent=pi_xxx&payment_intent_client_secret=...&redirect_status=succeeded
export default async function ExtendReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { bookingId } = await params
  const { payment_intent, redirect_status, newEndsAt, token } = await searchParams

  function backTo(extra: Record<string, string>) {
    const qs = new URLSearchParams(extra)
    if (token) qs.set("token", token)
    return `/extend/${bookingId}?${qs.toString()}`
  }

  if (redirect_status !== "succeeded" || !payment_intent) {
    redirect(backTo({ error: "payment" }))
  }

  try {
    await finalizeExtend({ bookingId, token, newEndsAt, paymentIntentId: payment_intent })
  } catch {
    redirect(backTo({ error: "finalize" }))
  }

  redirect(backTo({ extended: "1" }))
}
