import { redirect } from "next/navigation"

// Stripe redirects here after payment. Stripe appends:
// ?payment_intent=pi_xxx&payment_intent_client_secret=...&redirect_status=succeeded
export default async function BookReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const { redirect_status, bookingId } = await searchParams

  if (redirect_status !== "succeeded" || !bookingId) {
    redirect("/book?payment_error=1")
  }

  redirect(`/account/bookings?confirmed=${bookingId}`)
}
