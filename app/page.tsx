export default function HomePage() {
  return (
    <main className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-44 right-[-120px] h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Coming soon
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white md:text-5xl">
            Indoor golf. 24/7. No hassle.
          </h1>

          <p className="mt-4 text-base leading-7 text-neutral-300">
            Tee365 is launching 24/7 indoor golf simulators in the Mishawaka area.
            Location and launch window announced after lease signing.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-neutral-200 transition"
            >
              Join the Founding List
            </a>

            <span className="inline-flex items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-neutral-300">
              Gift cards soon
            </span>
          </div>

          <p className="mt-3 text-xs text-neutral-400">
            Two updates only: gift cards live and booking live.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Founding Members</h2>
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

        <div id="waitlist" className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white">Join the waitlist</h2>
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
      </section>

      {/* Mini FAQ */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold text-white">Quick answers</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Where?</p>
            <p className="mt-1 text-sm text-neutral-300">Mishawaka area. Address soon.</p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">When?</p>
            <p className="mt-1 text-sm text-neutral-300">Targeting 2026. Window after lease.</p>
          </div>
          <div className="rounded-xl bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Gift cards?</p>
            <p className="mt-1 text-sm text-neutral-300">Sold through Birrdi when live.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
