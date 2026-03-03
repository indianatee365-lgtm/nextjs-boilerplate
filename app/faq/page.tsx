export default function FAQPage() {
  return (
    <main className="space-y-10 pb-16">
      <header className="pt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white">FAQ</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">
          We’ll expand this section as we lock the lease, pricing, and booking.
        </p>
      </header>

      <section className="grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Where will you be located?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Mishawaka area. Address will be updated soon.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">When do you open?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Targeting fall of 2026. We’ll share a launch window after the lease is signed.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">How does 24/7 access work?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Book and pay online. Entry details will be text to your provided phone number 15 minutes before your tee time. Your rented bay will turn on and off automatically, with an option to extend your bay rental provided 15 minutes before the end of your session. 
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-base font-semibold text-white">Will you sell gift cards?</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Yes. Gift cards will be available for a discounted rate for a limited time. 
          </p>
        </div>
      </section>
    </main>
  );
}
