import { redirect } from "next/navigation"
import { finalizeReschedule } from "../../../actions"

// Stripe redirects here after 3DS authentication for reschedule delta payments.
// Stripe appends: ?payment_intent=pi_xxx&payment_intent_client_secret=...&redirect_status=succeeded
export default async function RescheduleReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { id: originalBookingId } = await params
  const { payment_intent, redirect_status, newStartsAt, newEndsAt, newBayId, netCharge } = await searchParams

  if (redirect_status !== "succeeded" || !payment_intent) {
    redirect("/account/bookings?reschedule_error=payment")
  }

  try {
    await finalizeReschedule({
      originalBookingId,
      newStartsAt,
      newEndsAt,
      newBayId,
      paymentIntentId: payment_intent,
      netCharge: parseFloat(netCharge ?? "0"),
    })
  } catch {
    redirect("/account/bookings?reschedule_error=finalize")
  }

  redirect("/account/bookings?rescheduled=1")
}
