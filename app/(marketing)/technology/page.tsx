import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Uneekor XR Launch Monitor | Tee365 Mishawaka",
  description:
    "Every Tee365 bay runs on the Uneekor XR, an overhead camera launch monitor with 19 tracked data points, no markers required, built specifically for indoor simulator bays.",
  alternates: {
    canonical: "https://tee365.org/technology",
  },
  openGraph: {
    type: "website",
    title: "Uneekor XR Launch Monitor | Tee365 Mishawaka",
    description:
      "Every Tee365 bay runs on the Uneekor XR, an overhead camera launch monitor with 19 tracked data points, no markers required, built specifically for indoor simulator bays.",
    url: "https://tee365.org/technology",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Uneekor XR Launch Monitor | Tee365 Mishawaka",
    description:
      "Every Tee365 bay runs on the Uneekor XR, an overhead camera launch monitor with 19 tracked data points, no markers required, built specifically for indoor simulator bays.",
    images: ["https://tee365.org/hero.jpg"],
  },
};

const BREADCRUMB_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://tee365.org/" },
    { "@type": "ListItem", position: 2, name: "Technology", item: "https://tee365.org/technology" },
  ],
};

export default function TechnologyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 md:px-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_SCHEMA) }} />

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">The Uneekor XR</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Real tracking technology. Not a toy simulator.
        </h1>
        <p className="mt-4 text-base leading-7 text-neutral-300">
          Every bay at Tee365 runs on the Uneekor XR, the same class of overhead tracking
          technology used in teaching studios and academies, not a stripped-down home unit. If
          you&apos;ve hit off a Trackman before, the numbers will feel familiar. If you know what
          to look for, you&apos;ll notice this one was built specifically for an indoor bay.
        </p>
      </header>

      <div className="mt-10 space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold text-white">What&apos;s actually tracking your ball</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            The Uneekor XR mounts overhead, behind the hitting area, and reads every swing with a
            pair of high-speed infrared cameras. Club AI follows your clubhead through impact.
            Dimple Optix reads the ball&apos;s dimple pattern directly, no sticker, no marked ball,
            no setup between golfers. Grab any ball, any club, and hit.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold text-white">19 data points, every swing</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Club speed, face angle, club path, and smash factor on the club side. Launch angle,
            backspin, sidespin, spin axis, angle of descent, and apex height on the ball side.
            Carry, total distance, and run on top of that. Nineteen tracked points, every single
            swing.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold text-white">Why camera tracking, not radar, indoors</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Trackman and other radar-based systems were built for the range: open space where a
            Doppler signal has room to stabilize into an accurate read. Indoors, that same
            technology can get particular about bay depth and mounting distance. The Uneekor XR
            sidesteps that entirely, it reads the ball and club directly from overhead, at the
            moment of impact, so the numbers are just as sharp in a 13-foot bay as a 30-foot one.
            That&apos;s exactly why more dedicated indoor simulator builds are moving to overhead
            camera tracking instead of retrofitting a system designed for outdoor space.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold text-white">No delay between swing and data</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Trackman and other radar-based systems have to observe the ball in flight before they
            can lock in a final number, so there&apos;s a beat between your swing and the data
            hitting the screen. The Uneekor XR reads everything it needs directly from the cameras
            at the moment of impact. Hit, glance up, your numbers are already there. Go again.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold text-white">No stickers. No markers. No setup.</h2>
          <p className="mt-3 text-sm leading-6 text-neutral-300">
            Grab any ball, any club, and hit. Club AI and Dimple Optix read everything they need
            directly, so there&apos;s no sticker to line up, no special ball to buy, and no delay
            between golfers in a shared bay.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <h2 className="text-xl font-semibold text-white">Uneekor XR vs. radar-based systems</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm text-neutral-300">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="py-2 pr-4 font-semibold"> </th>
                  <th className="py-2 pr-4 font-semibold">Uneekor XR</th>
                  <th className="py-2 font-semibold">Trackman &amp; other radar systems</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-3 pr-4 text-neutral-400">Tracking method</td>
                  <td className="py-3 pr-4">Overhead infrared camera + AI</td>
                  <td className="py-3">Doppler radar</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 pr-4 text-neutral-400">Ball prep</td>
                  <td className="py-3 pr-4">Any ball, no markers</td>
                  <td className="py-3">Often benefits from specific balls</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 pr-4 text-neutral-400">Full club data</td>
                  <td className="py-3 pr-4">Included</td>
                  <td className="py-3">Often a paid tier</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 pr-4 text-neutral-400">Time to see your numbers</td>
                  <td className="py-3 pr-4">Instant, read at impact</td>
                  <td className="py-3">Waits to observe ball flight first</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-neutral-400">Sensitive to bay depth</td>
                  <td className="py-3 pr-4">No, reads at impact overhead</td>
                  <td className="py-3">Can be, built for open range space</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <h2 className="text-xl font-semibold text-white">Come feel the difference yourself</h2>
        <div className="mt-5">
          <a
            href="/founders"
            className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Get Early Access
          </a>
        </div>
      </div>
    </main>
  );
}
