import Section from "../ui/Section";

export default function HowItWorks() {
  return (
    <Section>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          How it works
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-300">
          Book online, get in fast, and play without hassle.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-7">
            <p className="text-xs uppercase tracking-wider text-neutral-400">
              Step 1
            </p>
            <p className="mt-2 text-lg font-semibold text-white">Book</p>
            <p className="mt-2 text-sm text-neutral-300">
              Reserve a bay online in minutes.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-7">
            <p className="text-xs uppercase tracking-wider text-neutral-400">
              Step 2
            </p>
            <p className="mt-2 text-lg font-semibold text-white">Get access</p>
            <p className="mt-2 text-sm text-neutral-300">
              Receive entry instructions for your session.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-7">
            <p className="text-xs uppercase tracking-wider text-neutral-400">
              Step 3
            </p>
            <p className="mt-2 text-lg font-semibold text-white">Play</p>
            <p className="mt-2 text-sm text-neutral-300">
              Practice. Play. Compete.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
