import Section from "../ui/Section";

export default function TechBand() {
  return (
    <Section>
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          The tech inside every bay
        </p>

        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Uneekor XR tracking. Built for indoor, not adapted for it.
        </h2>

        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300">
          Every bay runs on the Uneekor XR, an overhead camera system that reads your swing in 19
          data points, no stickers, no marked balls, no waiting on a radar signal to settle. If
          you&apos;ve trained on a Trackman, you&apos;ll feel right at home. If you know the
          difference, you&apos;ll notice this one was built for a room like ours.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
            <p className="text-2xl font-semibold text-white">19</p>
            <p className="mt-1 text-xs text-neutral-400">data points per swing</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
            <p className="text-2xl font-semibold text-white">0</p>
            <p className="mt-1 text-xs text-neutral-400">stickers or markers needed</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
            <p className="text-2xl font-semibold text-white">Instant</p>
            <p className="mt-1 text-xs text-neutral-400">data, read at impact</p>
          </div>
        </div>

        <div className="mt-7">
          <a
            href="/technology"
            className="inline-flex items-center justify-center rounded-xl border border-[color:var(--brandLine)] bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            See the full breakdown
          </a>
        </div>
      </div>
    </Section>
  );
}
