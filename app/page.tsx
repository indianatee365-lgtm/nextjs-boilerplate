export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      {/* Hero */}
      <section className="rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">Coming soon</p>

        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-neutral-900">
          Indoor golf that fits your schedule.
        </h1>

        <p className="mt-4 max-w-2xl text-lg text-neutral-700">
          Tee365 is launching 24/7 indoor golf simulators in the Mishawaka area.
          Location and launch window announced after lease signing.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="#waitlist"
            className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Join the Founding List
          </a>

          <span className="inline-flex items-center justify-center rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-900 opacity-60">
            Gift cards (soon)
          </span>

          <a
            href="/faq"
            className="inline-flex items-center justify-center rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            FAQ
          </a>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Two updates only: gift cards live and booking live.
        </p>
      </section>

      {/* Info cards */}
      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-neutral-900">Founding Members</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Limited enrollment when we announce the location.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-neutral-800">
            <li>Locked-in membership price for life</li>
            <li>Extra discount for the first 12 months</li>
            <li>Early booking access</li>
            <li>Invite-only soft opening</li>
            <li>Name on the founder wall</li>
          </ul>
        </div>

        <div id="waitlist" className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-neutral-900">Join the waitlist</h2>
          <p className="mt-2 text-sm text-neutral-700">
            Drop your email. We’ll notify you when gift cards go live and when booking opens.
          </p>

          {/* Placeholder only: no JS, no provider connected */}
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="email"
              placeholder="Email address"
              className="w-full min-w-[260px] flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none"
              disabled
            />
            <button
              type="button"
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white opacity-60"
              disabled
            >
              Join
            </button>
          </div>

          <p className="mt-2 text-xs text-neutral-500">
            Waitlist form not connected yet.
          </p>
        </div>
      </section>

      {/* Gift cards section */}
      <section className="mt-12 rounded-2xl border border-neutral-200 bg-white p-6" id="giftcards">
        <h2 className="text-xl font-semibold text-neutral-900">Gift cards</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Gift cards will be sold through Birrdi Golf to help fund the startup.
          We’ll add the link here when they go live.
        </p>

        <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
          Status: not live yet.
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-14 text-xs text-neutral-500">
        © {new Date().getFullYear()} Tee365
      </footer>
    </main>
  );
}
