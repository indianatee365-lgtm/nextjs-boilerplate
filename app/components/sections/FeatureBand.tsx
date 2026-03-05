import Section from "../ui/Section";

export default function FeatureBand() {
  return (
    <Section>
      <div className="grid items-center gap-10 md:grid-cols-12">
        {/* Left: copy */}
        <div className="md:col-span-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Built for practice
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            A private bay, whenever you want it.
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-300">
            No crowds. No waiting. Book a session, get access, and hit when it fits your schedule.
          </p>

          <ul className="mt-6 space-y-3 text-sm text-neutral-200">
            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
              24/7 self-serve access
            </li>

            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
              Fast online booking
            </li>

            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
              Practice, rounds, and leagues
            </li>

            <li className="flex gap-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: "var(--brand)" }} />
              Mishawaka area
            </li>
          </ul>

          <div className="mt-8">
            <a
              href="#waitlist"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Join Email List
            </a>
          </div>
        </div>

        {/* Right: image */}
        <div className="md:col-span-6">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
            <img
              src="/hero.jpg"
              alt="Indoor golf simulator bay at Tee365 in Mishawaka, Indiana near Notre Dame"
              className="h-[320px] w-full object-cover md:h-[420px]"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

