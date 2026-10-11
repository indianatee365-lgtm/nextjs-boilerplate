import type { Metadata } from "next"
import Link from "next/link"
import UpcomingParties from "@/components/parties/UpcomingParties"
import PartyRules from "@/components/parties/PartyRules"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Parties & Watch Parties | Tee365 Indoor Golf, Mishawaka",
  description: "Watch parties, contests and game days at Tee365 in Mishawaka. Get tickets for the next party.",
  alternates: { canonical: "https://tee365.org/parties" },
  openGraph: { title: "Parties at Tee365", description: "Watch parties, contests and game days. Get your tickets.", url: "https://tee365.org/parties", images: [{ url: "https://tee365.org/hero.jpg" }] },
}

export default function PartiesPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12 md:px-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#00A651]">Parties at Tee365</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Watch parties, contests and game days</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-300">
          The big game on the screens, contests on the simulators, and the whole room in on it. Grab your tickets before they&apos;re gone.
        </p>
      </header>
      <UpcomingParties heading="On sale now" emptyText="No parties on sale right now. Check back soon, or follow us for the next one." />
      <PartyRules />
      <p className="text-sm text-neutral-400">
        Want the place to yourself instead? <Link href="/events" className="text-[#00A651] underline">Book a private event</Link>, or <Link href="/book" className="text-[#00A651] underline">book a bay</Link>.
      </p>
    </main>
  )
}
