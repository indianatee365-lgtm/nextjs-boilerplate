export default function Info() {
  return (
    <section
      id="info"
      className="relative overflow-hidden rounded-3xl border border-[color:var(--brandLine)] bg-white/5 p-8"
    >
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full blur-3xl opacity-40"
        style={{ backgroundColor: "var(--brandGlow)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-44 right-[-120px] h-[520px] w-[520px] rounded-full blur-3xl opacity-35"
        style={{ backgroundColor: "var(--brandSoft)" }}
      />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          
        </p>

        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Indoor golf. 24/7. No hassle.
        </h2>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300">
          Tee365 is building a 24/7 indoor golf space designed for quick sessions,
          late-night practice, competition with your buddies, or in a league. Full details, Pricing, and Address, 
          will be posted as soon as possible.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Founding Members</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Limited enrollment when we announce the location.
            </p>

            <ul className="mt-4 space-y-2 text-sm text-neutral-200">
              <li>Locked-in membership price for LIFE (Maintaining Active Membership Required)
              </li>
              <li>Extra discount for the first 12 months</li>
              <li>Early booking access</li>
              <li>Name on the founder wall</li>
            </ul>
          </div>

          <div
            id="waitlist"
            className="rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
          >
            <h3 className="text-lg font-semibold text-white">Join Our Email List</h3>
            <p className="mt-2 text-sm text-neutral-300">
              
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
            </p>
          </div>
        </div>

        <div
          id="gift"
          className="mt-8 rounded-2xl border border-[color:var(--brandLine)] bg-white/5 p-6"
        >
          <h3 className="text-lg font-semibold text-white">Gift cards</h3>
          <p className="mt-2 text-sm text-neutral-300">
            Gift cards will be sold at a discounted rate for a limited time. Keep track of our socials for updates.
          </p>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-neutral-300">
            Status: not live yet - check back soon
          </div>
        </div>
      </div>
    </section>
  );
}
