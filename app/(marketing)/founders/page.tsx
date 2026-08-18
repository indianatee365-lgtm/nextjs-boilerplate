import type { Metadata } from "next"
import { createServiceClient } from "@/lib/supabase/server"
import { JoinButton } from "../join/JoinClient"
import { FOUNDERS_CLUB_DEADLINE } from "@/lib/bookings/launch-gate"
import { CountdownClock } from "@/app/components/ui/CountdownClock"

export const metadata: Metadata = {
  title: "Founder's Club | Tee365 Indoor Golf Simulator South Bend",
  description: "Lock in lifetime pricing at South Bend's first 24/7 indoor golf simulator. 100 founding memberships, closing August 18, 2026. 30% off year one, 20% off forever.",
  alternates: {
    canonical: "https://tee365.org/founders",
  },
  openGraph: {
    type: "website",
    title: "Founder's Club | Tee365 Indoor Golf Simulator South Bend",
    description: "Lock in lifetime pricing at South Bend's first 24/7 indoor golf simulator. 100 founding memberships, closing August 18, 2026. 30% off year one, 20% off forever.",
    url: "https://tee365.org/founders",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Founder's Club | Tee365 Indoor Golf Simulator South Bend",
    description: "Lock in lifetime pricing at South Bend's first 24/7 indoor golf simulator. 100 founding memberships, closing August 18, 2026. 30% off year one, 20% off forever.",
    images: ["https://tee365.org/hero.jpg"],
  },
  robots: { index: true, follow: true },
}

const CHECK = (
  <svg className="w-5 h-5 text-brand flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

export default async function FoundersPage() {
  const serviceClient = await createServiceClient()

  const { data: plan } = await serviceClient
    .from("membership_plans")
    .select("id, price_monthly, joining_fee, max_members")
    .eq("slug", "founder")
    .single()

  const { count: founderCount } = await serviceClient
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan?.id ?? "")
    .in("status", ["active", "past_due"])

  const spotsRemaining = 100 - (founderCount ?? 0)
  const founderClosed = new Date() > FOUNDERS_CLUB_DEADLINE || spotsRemaining <= 0

  return (
    <main className="min-h-screen">

      {/* Hero */}
      <div className="border-b border-white/10 bg-gradient-to-b from-brand/10 to-transparent">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <p className="text-xs font-bold tracking-widest uppercase text-brand mb-4">
            Limited · 100 Members Ever
          </p>
          <h1 className="text-5xl font-bold text-white mb-6 leading-tight">
            Founder&apos;s Club
          </h1>
          <p className="text-xl text-neutral-300 max-w-2xl mx-auto mb-4">
            Before the doors open, there&apos;s a window for the people who believe first.
            One hundred spots. Permanent benefits. Closes August 18, 2026.
          </p>
          {!founderClosed && (
            <>
              <p className="text-sm text-brand font-semibold">
                {spotsRemaining <= 20
                  ? `Only ${spotsRemaining} spots remaining · Closes August 18, 2026`
                  : `Enrollment open · Closes August 18, 2026`}
              </p>
              <CountdownClock
                deadline={FOUNDERS_CLUB_DEADLINE.toISOString()}
                className="mt-2 text-lg font-bold tabular-nums text-white"
              />
            </>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-16">

        {/* Pricing block */}
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-8 mb-16">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-sm text-neutral-400 mb-2">Founder&apos;s Club pricing</p>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-5xl font-bold text-white">$29</span>
                <span className="text-neutral-400">/mo</span>
              </div>
              <p className="text-lg text-brand font-semibold">+ $199 one-time joining fee</p>
              <p className="text-sm text-neutral-500 mt-1">First invoice: $228. Then $29/mo.</p>
            </div>
            <div className="md:text-right">
              <JoinButton
                planSlug="founder"
                label="Claim Your Spot →"
                disabled={founderClosed}
                className="px-8 py-4 font-bold rounded-xl bg-brand text-white hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base"
              />
              {!founderClosed && (
                <p className="text-xs text-neutral-500 mt-2">
                  Joining fee non-refundable after 30 days
                </p>
              )}
              {founderClosed && (
                <p className="text-sm text-red-400 mt-2 font-semibold">Enrollment is closed</p>
              )}
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">What you get</h2>
            <ul className="space-y-4">
              {[
                ["30% off year one, 20% forever", "From opening through August 2027 at 30% off. Every booking after that, 20% off forever."],
                ["21-day advance booking", "The best booking window available. 3 weeks out, before anyone else can touch the calendar."],
                ["Up to 3 active reservations", "Keep your calendar loaded. Hold three upcoming sessions at once."],
              ].map(([title, desc]) => (
                <li key={title} className="flex gap-3">
                  {CHECK}
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="text-sm text-neutral-400 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white mb-6">Founder perks</h2>
            <ul className="space-y-4">
              {[
                ["Founders & Friends Day", "A private pre-opening event the day before Tee365 opens to the public. Founders, friends, and family only. Two complimentary hours included."],
                ["Name on the Founders Wall", "A permanent installation in the facility. The 100 people who made this happen, listed for as long as we're open."],
                ["Member number #1–100", "Your number is assigned in the order you join. It stays with you forever."],
                ["48-hour early booking access", "When the booking calendar goes live, Founders get in first, two full days before the public."],
                ["Reserved league slot", "Every league, every season. You have a spot if you want it."],
              ].map(([title, desc]) => (
                <li key={title} className="flex gap-3">
                  {CHECK}
                  <div>
                    <p className="font-semibold text-white">{title}</p>
                    <p className="text-sm text-neutral-400 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* From Jerrod */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 mb-16">
          <p className="text-xs font-semibold tracking-widest uppercase text-brand mb-4">A note from Jerrod</p>
          <p className="text-neutral-300 text-lg leading-relaxed mb-4">
            Not long ago, the closest place to work on your swing during a Michiana winter was 40 miles away.
            I know because I was the guy making that drive.
          </p>
          <p className="text-neutral-300 leading-relaxed mb-4">
            The Founder&apos;s Club is for people who believe in what we&apos;re building before they&apos;ve ever walked through the door.
            It&apos;s a real commitment, and we don&apos;t take it lightly. In return, you get the best deal we&apos;ll ever offer,
            a permanent place in this facility&apos;s history, and the satisfaction of knowing you were one of the first 100.
          </p>
          <div className="mt-6 border-t border-white/10 pt-6">
            <p className="font-semibold text-white italic">Jerrod</p>
            <p className="text-xs text-brand tracking-widest uppercase mt-1">Founder, Tee365</p>
          </div>
        </div>

        {/* Policy summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16 text-sm text-neutral-400">
          <div className="rounded-lg border border-white/10 p-4">
            <p className="font-semibold text-white mb-1">Status is permanent</p>
            <p>Your member number and Founders Wall listing are yours forever, even if you pause or cancel your monthly membership.</p>
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <p className="font-semibold text-white mb-1">Reactivation at Founder&apos;s terms</p>
            <p>If you ever cancel and come back, you return at your original Founder&apos;s pricing, not current market rates.</p>
          </div>
          <div className="rounded-lg border border-white/10 p-4">
            <p className="font-semibold text-white mb-1">Opening day guarantee</p>
            <p>If Tee365 doesn&apos;t open by November 1, 2026, all Founder fees are fully refundable on request.</p>
          </div>
        </div>

        {/* Bottom CTA */}
        {!founderClosed && (
          <div className="text-center">
            <p className="text-neutral-400 mb-2 text-sm">{spotsRemaining <= 20 ? `Only ${spotsRemaining} of 100 spots left. Closes August 18, 2026.` : "Lock in lifetime pricing. Closes August 18, 2026."}</p>
            <JoinButton
              planSlug="founder"
              label="Claim Your Spot"
              className="px-10 py-4 font-bold rounded-xl bg-brand text-white hover:bg-brand/90 transition-colors text-base"
            />
          </div>
        )}
      </div>
    </main>
  )
}
