import Link from "next/link"
import { Instagram, Facebook, Music2 } from "lucide-react"

// What /league shows while no league is open (the leagues row is inactive).
// It used to 404, while the header and footer League buttons kept linking
// here: from the 10/28 wind-down until 2026-11-10 every click was a dead end.
const SOCIALS = [
  { href: "https://www.instagram.com/tee365.mishawaka", label: "Instagram", Icon: Instagram },
  { href: "https://www.facebook.com/tee365.mishawaka", label: "Facebook", Icon: Facebook },
  { href: "https://www.tiktok.com/@tee365_mishawaka", label: "TikTok", Icon: Music2 },
]

export default function LeagueComingSoon() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-20 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">Tee365 League</p>
      <h1 className="mt-3 text-4xl font-bold text-white">Coming soon!</h1>
      <p className="mt-4 text-neutral-300">
        We&apos;re lining up the next Tee365 league now. Follow our socials for dates, format and the moment signups open.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {SOCIALS.map(({ href, label, Icon }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </a>
        ))}
      </div>
      <p className="mt-12 text-sm text-neutral-400">Can&apos;t wait? Grab some buddies and play a round any time, day or night.</p>
      <Link href="/book" className="btn-primary mt-4 inline-block px-6 py-3 font-semibold">Book a bay</Link>
    </main>
  )
}
