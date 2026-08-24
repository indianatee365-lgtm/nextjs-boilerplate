export default function HeroFull() {
  return (
    <section className="relative overflow-hidden bg-black min-h-[100svh] md:h-[720px] md:min-h-0">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="/hero.jpg"
          alt="Indoor golf simulator bay at Tee365 in Mishawaka, Indiana near Notre Dame"
          className="h-full w-full object-cover object-[center_72%]"
          width="1920"
          height="1080"
          loading="eager"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.15) 58%, rgba(0,0,0,0) 75%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black via-black/70 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative mx-auto flex min-h-[100svh] max-w-6xl px-6 md:min-h-0 md:h-full">
        <div className="w-full max-w-3xl pt-[calc(5.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:my-auto md:pt-0 md:pb-0">
          <span
            className="inline-flex items-center rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-black sm:text-sm"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Booking now open · Aug 30 &amp; beyond
          </span>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-6xl leading-[1.05]">
            <span className="block">Indoor Golf Simulator</span>
            <span className="block">in Mishawaka, Indiana</span>
            <span className="block">Near Notre Dame and South Bend</span>
          </h1>

          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-emerald sm:text-3xl md:text-4xl leading-[1.1]">
            <span className="block">Practice. Play. Compete.</span>
            <span className="block">It&apos;s always 70&deg; at Tee365.</span>
          </h2>

          <p className="mt-4 text-base leading-7 text-neutral-200">
            24/7 indoor golf simulator bays for practice, quick rounds, and competition in
            South Bend, Indiana. Minutes from Notre Dame and serving the greater Michiana region.
          </p>

          <div className="mt-7">
            <a
              href="/book"
              className="inline-flex w-full items-center justify-center rounded-2xl px-10 py-5 text-xl font-bold text-black shadow-lg shadow-black/30 transition hover:brightness-95 sm:w-auto sm:text-2xl"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Book Now →
            </a>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="/join"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Become a Member
            </a>

            <a
              href="/gift-cards"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Buy a Gift Card
            </a>

            <a
              href="/faq"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              FAQ
            </a>
          </div>

          <p className="mt-4 text-base font-medium text-neutral-100 sm:text-lg">4615 Grape Rd, Mishawaka, IN 46545</p>
        </div>
      </div>
    </section>
  )
}