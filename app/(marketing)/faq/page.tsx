import type { Metadata } from "next";
import { FAQItem } from "./FAQItem";

export const metadata: Metadata = {
  title: "FAQ | Indoor Golf Simulator South Bend | Tee365",
  description: "Answers to common questions about Tee365: South Bend's 24/7 indoor golf simulator. Hours, booking, clubs, pricing, and more.",
  alternates: {
    canonical: "https://tee365.org/faq",
  },
  openGraph: {
    type: "website",
    title: "FAQ | Indoor Golf Simulator South Bend | Tee365",
    description: "Answers to common questions about Tee365: South Bend's 24/7 indoor golf simulator. Hours, booking, clubs, pricing, and more.",
    url: "https://tee365.org/faq",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "FAQ | Indoor Golf Simulator South Bend | Tee365",
    description: "Answers to common questions about Tee365: South Bend's 24/7 indoor golf simulator. Hours, booking, clubs, pricing, and more.",
    images: ["https://tee365.org/hero.jpg"],
  },
};

// One list feeds both the page and the FAQPage schema, so what search and AI
// tools read can never drift from what customers see. Lead each answer with
// the fact itself: that first sentence is what gets quoted.
// Never quote bay rates here, they change by season, day and time (2026-10-24).
const faqs = [
  { q: "Where is Tee365?", a: "Tee365 is at 4615 Grape Rd, Unit A, Mishawaka, IN 46545, just outside South Bend and minutes from Notre Dame." },
  { q: "What are your hours?", a: "Tee365 is open 24 hours a day, 365 days a year, including holidays. You can play at 6am, 2am, or anytime in between. Book online at tee365.org/book." },
  { q: "How much does a bay cost?", a: "Bays are booked by the hour and priced per bay, not per player, with up to 4 players sharing a bay. Like an outdoor course, rates vary by season, day of the week, and time of day. See live prices for every time slot at tee365.org/book. Members save on every booking, see plans at tee365.org/join." },
  { q: "How does 24/7 access work?", a: "Book and pay online, and your door code is texted to you 15 minutes before your tee time. Your bay turns on and off automatically. If the bay is available, you'll get an option to extend your session 15 minutes before it ends." },
  { q: "Is there staff at Tee365?", a: "No, Tee365 has no staff on site. Booking, entry, and bay startup are all automatic. If you need help, call the number posted in your bay any time, day or night." },
  { q: "Do I bring my own golf clubs?", a: "Yes, most players bring their own clubs. Please clean your clubs and shoes before using the bay and leave it the way you found it." },
  { q: "Does Tee365 have loaner clubs?", a: "Yes. Clubbie Corner is our loaner-club station, free for anyone who didn't bring their own clubs. There is no rental fee." },
  { q: "Is Tee365 good for beginners?", a: "Yes. Every bay is private, so there's no one watching and no pace-of-play pressure. Hit balls on the range, play a full course, or just learn the basics at your own speed. Loaner clubs are free if you don't own any yet." },
  { q: "What launch monitor technology does Tee365 use?", a: "Every bay runs on the Uneekor EYE XR, an overhead camera-based launch monitor and swing analysis system. It tracks 19 data points per swing, including club speed, face angle, path, spin, and carry, with no stickers or marked balls required. Full breakdown on our Technology page." },
  { q: "Is it as good as Trackman?", a: "It's the same class of technology, built specifically for an indoor bay. Trackman and other radar-based systems were designed for outdoor range use and can be more sensitive to bay depth indoors. The Uneekor EYE XR reads the ball and club directly from overhead at impact, so you get comparable data (club speed, spin, path, launch angle, and more) without needing the extra room a radar signal wants." },
  { q: "How is Tee365 different from other indoor golf places?", a: "Tee365 is built for golfers who want to practice and play. Private bays, open 24/7, no bar, no crowds, and no staff to wait on. Book online, get a door code, and play. Think of it as a 24-hour gym for golf." },
  { q: "Do you have a golf league?", a: "Yes. The Tee365 Thursday Night League is two-person teams, A/B match play, 9 holes a week on a different course each week, and 100% of the pot is paid out. Current season dates, cost, and signup are at tee365.org/league." },
  { q: "Can I host a party or group event at Tee365?", a: "Yes. Tee365 hosts birthdays, bachelor and bachelorette parties, corporate team building, holiday parties, and group outings, from one bay up to a full facility buyout, at any hour of any day. Tell us your group size and date at tee365.org/events. For watch parties and contests open to the public, see tee365.org/parties." },
  { q: "Is there an age requirement?", a: "Minors of any age are always welcome with a parent or guardian. To book or visit unaccompanied, you must be 18 or older, or 16 or older if you're a member or part of our high school partner program." },
  { q: "Can I bring my pet?", a: "Service animals are always welcome. We're not able to allow other pets or animals in the facility." },
  { q: "Can I play my own music or videos?", a: "Yes, play whatever you'd like through your own device. Just keep the volume considerate of other guests in nearby bays." },
  { q: "How many players are allowed in each bay per booking?", a: "Up to 4 players per bay is the recommended maximum." },
  { q: "How long should I book a bay for?", a: "2 players can comfortably play nine holes per hour. Want to play 18 holes with 2 players? Book 2 hours. 18 holes with 4 players? Book 4 hours. Pro tip: book 2 bays for 2 hours and your time waiting on your playing partners gets cut in half." },
  { q: "What happens if I have trouble with my bay?", a: "Every bay has a basic troubleshooting guide, and if that doesn't fix it, call the number posted in your bay and we'll work to solve your issue." },
  { q: "Is there a dress code?", a: "There is no specific dress code. Please wear appropriate attire for a public setting." },
  { q: "Is there food or beverage available?", a: "No food or beverage is sold on site, but you're welcome to bring your own. No glass bottles are allowed." },
  { q: "Is alcohol allowed?", a: "No. There is no alcohol allowed on premises, with a zero tolerance policy." },
  { q: "Do you sell gift cards?", a: "Yes, gift cards are available at tee365.org/gift-cards. They're delivered instantly by email, redeemable on any bay booking, and they never expire." },
  { q: "Do you offer a military discount?", a: "Yes. Active duty, Reserve, National Guard and veterans all get 10% off bay time, on every booking, for as long as you have an account with us. Email info@tee365.org from the address on your Tee365 account and tell us you served, and we'll switch it on." },
  { q: "What is your cancellation policy?", a: "Cancellations more than 24 hours before your session receive a full refund to your original payment method. Cancellations within 24 hours are non-refundable and the full session amount is forfeited. You can cancel any upcoming booking from your account at tee365.org/account/bookings." },
  { q: "Can I reschedule my booking?", a: "Yes. You can reschedule up to 4 hours before your session from your account at tee365.org/account/bookings. A flat $5 reschedule fee always applies. The new session is priced at the current rate for the new time. If that rate is higher you pay the difference plus the $5 fee; if it's lower you get a refund of the difference (the $5 fee still applies). Need to reschedule within 4 hours? Email us at info@tee365.org and we'll do our best." },
];

export default function FAQPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <main className="mx-auto max-w-5xl space-y-10 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <header className="px-12">
        <h1 className="text-3xl font-semibold tracking-tight text-white">FAQ</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">
          Don&apos;t see your question? Email info@tee365.org or message us on
          our socials and we&apos;ll get you an answer.
        </p>
      </header>

      <section className="px-6 md:px-12">
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {faqs.map(({ q, a }, i) => (
            <FAQItem key={q} q={q} a={a} first={i === 0} />
          ))}
        </div>
      </section>
    </main>
  );
}
