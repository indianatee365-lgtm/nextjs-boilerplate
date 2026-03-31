import Script from "next/script"

export const metadata = {
  title: "Indoor Golf Simulator in South Bend Near Notre Dame | Tee365",
  description:
    "24/7 indoor golf simulator bays in South Bend, Indiana near Notre Dame. Practice, play full rounds, and compete year-round in private simulator bays.",
}

const BREADCRUMB_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://tee365.org/" },
    { "@type": "ListItem", position: 2, name: "Indoor Golf Simulator South Bend", item: "https://tee365.org/indoor-golf-simulator-south-bend" },
  ],
}

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "Is Tee365 open 24/7?", acceptedAnswer: { "@type": "Answer", text: "Tee365 is planned as a 24/7 indoor golf simulator facility with online booking and access instructions for your session." } },
    { "@type": "Question", name: "Can I practice and play full rounds?", acceptedAnswer: { "@type": "Answer", text: "Yes. Tee365 is designed for practice sessions, quick rounds, and competitive play in private bays." } },
    { "@type": "Question", name: "Do you serve Notre Dame and Michiana golfers?", acceptedAnswer: { "@type": "Answer", text: "Yes. Tee365 is in South Bend and serves golfers across Notre Dame, Granger, Mishawaka, and the surrounding Michiana region." } },
  ],
}

export default function IndoorGolfSimulatorSouthBendPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 pt-24 pb-20">
      <Script id="tee365-breadcrumb-south-bend" type="application/ld+json" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }} />
      <Script id="tee365-faq-south-bend" type="application/ld+json" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />

      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-300">Tee365 South Bend, Indiana</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-6xl leading-[1.05]">Indoor Golf Simulator in South Bend Near Notre Dame</h1>
        <p className="mt-5 text-base leading-7 text-neutral-200">Tee365 is a 24/7 indoor golf simulator facility in South Bend, Indiana — serving golfers across Granger, Mishawaka, and the greater Michiana region. Reserve a private bay online, practice year-round, play real courses, and compete with friends no matter the weather.</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href="/#waitlist" className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95" style={{ backgroundColor: "var(--brand)" }}>Get Early Access</a>
          <a href="/#info" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15">See Details</a>
        </div>
      </header>

      <section className="mt-14 grid gap-10 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Why indoor golf in South Bend</h2>
          <p className="mt-4 text-base leading-7 text-neutral-200">Northern Indiana weather shortens the outdoor season. Indoor golf simulators keep you practicing through winter, give consistent feedback, and help you stay ready for spring. Tee365 is designed for golfers who want a focused, golf-first space.</p>
          <ul className="mt-6 space-y-2 text-neutral-200">
            <li>• Practice year-round</li>
            <li>• Play full rounds in less time</li>
            <li>• Private bays for focus and comfort</li>
            <li>• Minutes from Notre Dame</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-white">Who Tee365 is for</h2>
          <p className="mt-4 text-base leading-7 text-neutral-200">Tee365 fits solo practice, pairs, and groups who want to improve, play real rounds, and compete without a bar-first environment.</p>
          <ul className="mt-6 space-y-2 text-neutral-200">
            <li>• University students and staff</li>
            <li>• South Bend and Granger golfers</li>
            <li>• League and competition players</li>
            <li>• Anyone who wants winter golf practice</li>
          </ul>
        </div>
      </section>

      <section className="mt-14 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Near Notre Dame and Michiana</h2>
        <p className="mt-4 text-base leading-7 text-neutral-200">Tee365 is located in South Bend, right in the heart of Michiana and minutes from Notre Dame. It's a convenient indoor golf option for students, alumni, and local golfers looking for a reliable place to practice through winter and early spring.</p>
      </section>

      <section className="mt-14 max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-white">FAQ</h2>
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Is Tee365 open 24/7?</h3>
            <p className="mt-2 text-neutral-200">Tee365 is planned as a 24/7 indoor golf simulator facility with online booking and access instructions for your session.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Can I practice and play full rounds?</h3>
            <p className="mt-2 text-neutral-200">Yes. Tee365 is designed for practice sessions, quick rounds, and competitive play in private bays.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-lg font-semibold text-white">Do you serve Notre Dame and Michiana golfers?</h3>
            <p className="mt-2 text-neutral-200">Yes. Tee365 is in South Bend and serves golfers across Notre Dame, Granger, Mishawaka, and the surrounding Michiana region.</p>
          </div>
        </div>
      </section>

      <section className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-10">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Get launch updates</h2>
        <p className="mt-3 text-neutral-200">Get early access to founding memberships, pricing, and launch updates.</p>
        <div className="mt-6">
          <a href="/#waitlist" className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95" style={{ backgroundColor: "var(--brand)" }}>Get Early Access</a>
        </div>
      </section>
    </main>
  )
}
