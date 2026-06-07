export const metadata = { title: "Consent Complete | Tee365" }

export default function ConsentCompletePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="rounded-xl border border-brand/20 bg-brand/5 px-6 py-10">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand text-2xl">✓</div>
        <h1 className="text-xl font-semibold text-white">Consent complete</h1>
        <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
          Thank you. We've sent a confirmation to your child. Their account is now active and they can book a bay.
        </p>
        <p className="mt-6 text-xs text-neutral-600">Tee365 Indoor Golf · bookings@tee365.org</p>
      </div>
    </main>
  )
}
