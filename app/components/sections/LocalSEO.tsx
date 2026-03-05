import Link from "next/link"

export default function LocalSEO() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-10 pb-16 md:pt-14 md:pb-20">
      <div className="max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Indoor Golf Simulator Near Notre Dame and South Bend
        </h2>

        <p className="mt-4 text-base leading-7 text-neutral-200">
          Golf in Northern Indiana doesn’t stop when the weather turns cold.
          Tee365 provides a private indoor golf simulator experience in
          Mishawaka, minutes from the University of Notre Dame and serving
          golfers across South Bend, Granger, and the greater Michiana region.
        </p>

        <p className="mt-4 text-base leading-7 text-neutral-200">
          Unlike entertainment-focused venues, Tee365 is designed for golfers
          who want to practice, play full rounds, and improve year-round. Each
          private simulator bay provides a focused environment to work on your
          game, play real courses, or compete with friends without waiting for
          crowded tee times or dealing with Indiana weather.
        </p>

        <p className="mt-4 text-base leading-7 text-neutral-200">
          Whether you're a Notre Dame student practicing through the winter, a
          South Bend golfer preparing for spring tournaments, or a Michiana
          resident looking for a quick round after work, Tee365 offers
          convenient 24/7 access and a golf-first experience.
        </p>

        <p className="mt-4 text-base leading-7 text-neutral-200">
          Tee365 brings modern indoor golf simulator technology to Mishawaka
          with a simple goal: make practice easier, rounds faster, and golf
          accessible year-round.
        </p>

        <div className="mt-6">
          <Link
            href="/indoor-golf-simulator-mishawaka"
            className="text-sm font-semibold text-emerald hover:underline"
          >
            Learn more about indoor golf simulators in Mishawaka →
          </Link>
        </div>
      </div>
    </section>
  )
}