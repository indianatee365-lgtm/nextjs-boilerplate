export default function FAQPage() {
  return (
    <main className="space-y-10 pb-16">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">FAQ</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">
          Quick answers. We’ll expand this as we lock the lease, pricing, and booking.
        </p>
      </header>

      <section className="grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Where will you be located?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Mishawaka area. Exact address will be posted after lease signing.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">When do you open?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Targeting 2026. We’ll share a launch window after the lease is signed.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">How does 24/7 access work?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Booking and entry details will be posted once our access system is finalized.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Will you sell gift cards?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Yes. Gift cards will be available online once our provider is live.
          </p>
        </div>
      </section>
    </main>
  );
}
