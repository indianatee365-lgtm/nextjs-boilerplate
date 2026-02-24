export default function HomePage() {
  return (
    <main className="space-y-10">
      {/* Top logo */}
      <section className="pt-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="Tee365"
            className="h-32 w-32 rounded-full border border-white/15 bg-black/30 p-2 shadow-lg"
          />

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white">
            Tee365
          </h1>

          <p className="mt-3 text-base leading-7 text-neutral-300">
            24/7 indoor golf simulators in the Mishawaka area.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
  <a
    href="#info"
    className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-black transition hover:brightness-95"
    style={{ backgroundColor: "var(--brand)" }}
  >
    See details
  </a>

  <a
    href="/faq"
    className="inline-flex items-center justify-center rounded-xl border border-[color:var(--brandLine)] bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
  >
    FAQ
  </a>
</div>

          <p className="mt-3 text-xs text-neutral-400">
            Location and launch window announced after lease signing.
          </p>
        </div>
      </section>

      {/* Info */}
      <section
        id="info"
        className="relative overflow-hidden rounded-3xl border border-[color:var(--brandLine)] bg-white/5 p-8"
      >
        {/* Glow blobs (behind content) */}
        <div
          className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ backgroundColor: "var(--brandGlow)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-44 right-[-120px] h-[520px] w-[520px] rounded-full blur-3xl"
          style={{ backgroundColor: "var(--brandSoft)" }}
        />

        {/* Content */}
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Coming soon
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Indoor golf. 24/7. No hassle.
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300">
            Tee365 is building a 24/7 indoor golf space designed for quick sessions,
            late-night practice, and easy booking. Pricing, address, and booking provider
            will be posted once finalized.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
              <h3 className="text-lg font-semibold text-white">Founding Members</h3>
              <p className="mt-2 text-sm text-neutral-300">
                Limited enrollment when we announce the location.
              </p>

              <ul className="mt-4 space-y-2 text-sm text-neutral-200">
                <li>Locked-in membership price for life</li>
                <li>Extra discount for the first 12 months</li>
                <li>Early booking access</li>
                <li>Invite-only soft opening</li>
                <li>Name on the founder wall</li>
              </ul>
            </div>

            <div
              id="waitlist"
              className="rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
            >
              <h3 className="text-lg font-semibold text-white">Waitlist</h3>
              <p className="mt-2 text-sm text-neutral-300">
                Email capture not connected yet.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <input
                  type="email"
                  placeholder="Email address"
                  disabled
                  className="w-full min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 outline-none"
                />
                <button
                  type="button"
                  disabled
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-neutral-300"
                >
                  Join
                </button>
              </div>

              <p className="mt-2 text-xs text-neutral-400">
                Next step: embed Mailchimp or a Google Form.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Gift cards</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Gift cards will be sold through Birrdi Golf. We’ll add the link the moment it goes live.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-300">
              Status: not live yet.
            </div>
          </div>
        </div>
      </section>

      {/* Quick answers */}
      <section className="rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Quick answers</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Where?</p>
            <p className="mt-1 text-sm text-neutral-300">Mishawaka area. Address soon.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">When?</p>
            <p className="mt-1 text-sm text-neutral-300">Targeting 2026. Window after lease.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Gift cards?</p>
            <p className="mt-1 text-sm text-neutral-300">Sold through Birrdi when live.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
