import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Private Events & Group Outings | Tee365 Indoor Golf Simulator",
  description: "Book Tee365 for your next event. Bachelor and bachelorette parties, corporate outings, birthday parties, and group bookings at South Bend's indoor golf simulator.",
  alternates: {
    canonical: "https://tee365.org/events",
  },
  openGraph: {
    type: "website",
    title: "Private Events & Group Outings | Tee365 Indoor Golf Simulator",
    description: "Book Tee365 for your next event. Bachelor and bachelorette parties, corporate outings, birthday parties, and group bookings at South Bend's indoor golf simulator.",
    url: "https://tee365.org/events",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Private Events & Group Outings | Tee365 Indoor Golf Simulator",
    description: "Book Tee365 for your next event. Bachelor and bachelorette parties, corporate outings, birthday parties, and group bookings at South Bend's indoor golf simulator.",
    images: ["https://tee365.org/hero.jpg"],
  },
};

const EVENTS_SERVICE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType: "Indoor Golf Simulator Rental",
  provider: {
    "@type": "LocalBusiness",
    name: "Tee365",
    url: "https://tee365.org",
    telephone: "+15744449365",
    address: {
      "@type": "PostalAddress",
      streetAddress: "4615 Grape Rd",
      addressLocality: "Mishawaka",
      addressRegion: "IN",
      postalCode: "46545",
      addressCountry: "US",
    },
  },
  areaServed: { "@type": "City", name: "South Bend" },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Group Events and Private Bookings",
    itemListElement: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Bachelor & Bachelorette Parties" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Corporate Events & Team Building" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Birthday Parties" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Group Outings" } },
    ],
  },
};


const events = [
  {
    label: "Bachelor & Bachelorette Parties",
    body: "Give the group something worth doing. No tee time pressure, no cover charge, no bar tab to split at the end. Compete head-to-head, run a closest-to-the-pin contest, or just mess around on Pebble Beach at midnight. Tee365 is open 24/7, so the party starts when you're ready.",
  },
  {
    label: "Corporate Events & Team Building",
    body: "Get your team off the conference room chairs and into a bay. Whether you're rewarding a quarter well done or just need a reason to get everyone in the same room, a few hours at the simulator beats any trust fall exercise. No golf experience required. Everyone competes, everyone has fun.",
  },
  {
    label: "Birthday Parties",
    body: "Book one bay or the whole facility. Play a round on any course in the world, run a skills competition, or just have a great time. It's a memorable way to celebrate, and it works for golfers and non-golfers alike. We handle the setup, you bring the cake.",
  },
  {
    label: "Group Outings",
    body: "Golf leagues, friend groups, neighborhood outings, father-son trips, or any reason you want to get a group together and hit some balls. Tee365 is climate-controlled, private, and available any time of day or night. Rain, snow, or 95 degrees outside, it doesn't matter.",
  },
  {
    label: "Holiday & Seasonal Events",
    body: "Company holiday parties, end-of-season celebrations, pre-tournament warmups. If you need a venue that's a little different from the usual banquet hall, Tee365 is it. Open every day of the year, including the ones when everywhere else is closed.",
  },
];

export default function EventsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(EVENTS_SERVICE_SCHEMA) }} />
      <header className="px-6 md:px-12">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">Group bookings &amp; private events</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Bring Your Group to Tee365</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-300">
          Multiple simulator bays, open 24 hours a day, 365 days a year. Tee365 is a different kind of event venue, one where the experience is the point. No waitstaff to coordinate around, no room rental minimums, and no pressure to wrap things up by 10pm.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          Small group or a full buyout, reach out and we'll put together a setup that works for you.
        </p>
      </header>

      <section className="px-6 md:px-12 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">What we're a great fit for</h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden divide-y divide-white/10">
          {events.map(({ label, body }) => (
            <div key={label} className="p-6 space-y-2">
              <h3 className="text-sm font-semibold text-white">{label}</h3>
              <p className="text-sm leading-relaxed text-neutral-300">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 md:px-12">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-4">Good to know</h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 text-sm leading-relaxed text-neutral-300">
          <p>
            <span className="font-semibold text-white">Capacity.</span> We can accommodate groups of most sizes across our bays. Reach out and we'll figure out what works for your headcount.
          </p>
          <p>
            <span className="font-semibold text-white">Food and drinks.</span> We don't sell food or beverages on site, but you're welcome to bring your own. No glass bottles, please.
          </p>
          <p>
            <span className="font-semibold text-white">Alcohol.</span> There is no alcohol allowed at Tee365. Zero tolerance, no exceptions.
          </p>
          <p>
            <span className="font-semibold text-white">Clubs.</span> Bring your own, or ask us about the loaner options we'll have available. No equipment rental fees.
          </p>
          <p>
            <span className="font-semibold text-white">Timing.</span> Tee365 opens for booking August 30, 2026 at 4615 Grape Rd, Mishawaka, IN. Events are available during any hour, any day.
          </p>
        </div>
      </section>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-[#00A651]/30 bg-[#00A651]/5 p-8 space-y-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">Set up your event</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Get in Touch</h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              Tell us what you're thinking, how many people you're expecting, and when. We'll take it from there and make sure everything is ready before your group walks through the door.
            </p>
          </div>
          <div className="space-y-4 border-t border-white/10 pt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651] mb-2">Phone</p>
              <a href="tel:+15744449365" className="text-sm text-neutral-300 transition hover:text-white">
                (574) 444-9365
              </a>
              <p className="mt-1 text-xs text-neutral-500">Calls answered by our AI agent. Leave a message or follow the prompts and we'll follow up directly.</p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651] mb-2">Email</p>
              <a href="mailto:info@tee365.org" className="text-sm text-neutral-300 transition hover:text-white">
                info@tee365.org
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
