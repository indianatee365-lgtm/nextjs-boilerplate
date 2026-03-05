export default function HeroFull() {
  return (
    <section className="relative overflow-hidden bg-black min-h-[100dvh]">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src="/hero.jpg"
          alt="Indoor golf simulator bay at Tee365 in Mishawaka, Indiana near Notre Dame"
          className="h-full w-full object-cover object-[center_72%]"
        />

        {/* Top dark wash for readability */}
        <div className="absolute inset-0 bg-black/55" />

        {/* Bottom gradient so content feels grounded */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/70 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-12 md:pt-28 md:pb-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
            Coming Fall of 2026
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Indoor Golf Simulator <br />
            in Mishawaka, Indiana <br />
            Near Notre Dame and South Bend
          </h1>

          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-emerald md:text-4xl">
            Practice. Play. Compete. <br />
            It&apos;s always 70 degrees at Tee365.
          </h2>

          <p className="mt-5 text-base leading-7 text-neutral-200">
            24/7 indoor golf simulator bays for practice, quick rounds, and
            competition in Mishawaka, Indiana. Minutes from Notre Dame and
            serving the greater South Bend and Michiana region.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#info"
              className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95"
              style={{ backgroundColor: "var(--brand)" }}
            >
              See Details
            </a>

            <a
              href="#waitlist"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Email List
            </a>

            <a
              href="/faq"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              FAQ
            </a>
          </div>

          <p className="mt-4 text-xs text-neutral-300">
            Location and launch date coming soon.
          </p>
        </div>
      </div>
    </section>
  )
}