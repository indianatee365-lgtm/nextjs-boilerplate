export const metadata = {
  title: "Indoor Golf Simulator in Mishawaka Near Notre Dame | Tee365",
  description:
    "24/7 indoor golf simulator bays in Mishawaka, Indiana near Notre Dame and South Bend. Practice, play full rounds, and compete year-round in private simulator bays.",
}

export default function IndoorGolfSimulatorMishawakaPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pt-24 pb-20">
      {/* Hero */}
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
          Tee365 Mishawaka, Indiana
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl leading-[1.05]">
          Indoor Golf Simulator in Mishawaka Near Notre Dame
        </h1>

        <p className="mt-5 text-base leading-7 text-neutral-200">
          Tee365 is a 24/7 indoor golf simulator facility in Mishawaka, Indiana,
          minutes from the University of Notre Dame and serving golfers across
          South Bend, Granger, and the greater Michiana region. Reserve a
          private bay online, practice year-round, play full rounds, and compete
          with friends without weather delays.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="/#waitlist"
            className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Join Email List
          </a>

          <a
            href="/#info"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            See Details
          </a>
        </div>
      </header>

      {/* Content */}
      <section className="mt-14 grid gap-10 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Why indoor golf in Mishawaka
          </h2>
          <p className="mt-4 text-base leading-7 text-neutral-200">
            Northern Indiana weather shortens the outdoor season. Indoor golf
            simulators let you keep your swing sharp all winter, get real ball
            flight feedback, and stay ready for spring rounds. Tee365 is built
            for golfers who want a simple, golf-first space to practice and play
            on their schedule.
          </p>
          <ul className="mt-6 space-y-2 text-neutral-200">
            <li>• Practice year-round</li>
            <li>• Play full rounds in less time</li>
            <li>• Private bays for focus and comfort</li>
            <li>• Minutes from Notre Dame and South Bend</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Who Tee365 is for
          </h2>
          <p className="mt-4 text-base leading-7 text-neutral-200">
            Tee365 is designed for golfers who want to improve, play real rounds,
            and compete without the noise of a bar environment. It fits solo
            practice, pairs, and groups looking for a focused indoor golf
            experience in the South Bend area.
          </p>
          <ul className="mt-6 space-y-2 text-neutral-200">
            <li>• Notre Dame students and staff</li>
            <li>• South Bend and Granger golfers</li>
            <li>• League and competition players</li>
            <li>• Anyone who wants winter golf practice</li>
          </ul>
        </div>
      </section>

      {/* Local relevance */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Near Notre Dame and South Bend
        </h2>
        <p className="mt-4 text-base leading-7 text-neutral-200">
          Tee365 is located in Mishawaka, a short drive from Notre Dame and South
          Bend. That makes it a convenient indoor golf option for students,
          alumni, and local golfers looking for a reliable place to practice
          through winter and early spring.
        </p>
      </section>

      {/* FAQ */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-white">FAQ</h2>

        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">
              Is Tee365 open 24/7?
            </h3>
            <p className="mt-2 text-neutral-200">
              Tee365 is planned as a 24/7 indoor golf simulator facility with
              online booking and access instructions for your session.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">
              Can I practice and play full rounds?
            </h3>
            <p className="mt-2 text-neutral-200">
              Yes. Tee365 is designed for practice sessions, quick rounds, and
              competitive play in private bays.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">
              Do you serve South Bend and Notre Dame golfers?
            </h3>
            <p className="mt-2 text-neutral-200">
              Yes. Tee365 is in Mishawaka and serves golfers across South Bend,
              Notre Dame, Granger, and the surrounding Michiana region.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-10">
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Get launch updates
        </h2>
        <p className="mt-3 text-neutral-200">
          Join the email list for opening updates, pricing, and early access.
        </p>
        <div className="mt-6">
          <a
            href="/#waitlist"
            className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Join Email List
          </a>
        </div>
      </section>
    </main>
  )
}