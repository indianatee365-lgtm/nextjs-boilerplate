export default function HeroFull() {
  return (
    <section className="relative overflow-hidden bg-black h-[100dvh] md:h-[720px]">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/hero.jpg"
          alt="Indoor golf simulator bay at Tee365 in Mishawaka, Indiana near Notre Dame"
          className="h-full w-full object-cover object-[center_72%]"
        />

        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/70 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative mx-auto flex h-full max-w-6xl px-6 items-start pt-[calc(6rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] md:items-center md:pt-0 md:pb-16">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
            Coming Fall of 2026
          </p>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-6xl">
            <span className="block">Indoor Golf Simulator</span>
            <span className="block">in Mishawaka, Indiana</span>
            <span className="block">Near Notre Dame and South Bend</span>
          </h1>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-emerald sm:text-3xl md:text-4xl">
            <span className="block">Practice. Play. Compete.</span>
            <span className="block">It&apos;s always 70 degrees at Tee365.</span>
          </h2>

          <p className="mt-5 text-base leading-7 text-neutral-200">
            24/7 indoor golf simulator bays for practice, quick rounds, and competition in
            Mishawaka, Indiana. Minutes from Notre Dame and serving the greater South Bend
            and Michiana region.
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