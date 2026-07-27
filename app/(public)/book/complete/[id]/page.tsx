import CompleteBookingFlow from "./CompleteBookingFlow"

export const metadata = {
  title: "Complete Your Booking | Tee365",
}

export default async function CompleteBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Complete Your Booking</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Finish setting up the reservation made for you over the phone.
      </p>
      <CompleteBookingFlow bookingId={id} />
    </main>
  )
}
