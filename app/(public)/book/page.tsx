import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingFlow from "./BookingFlow"
import { hasFoundersDayCredit, FOUNDERS_CLUB_DEADLINE } from "@/lib/bookings/launch-gate"

export const metadata = {
  title: "Book a Bay | Tee365",
}

export default async function BookPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login") // LAUNCH: remove this line to open tee sheet to public

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role, first_name, last_name, is_minor, parental_consent_verified")
    .eq("id", user.id)
    .single()

  const isAdmin = (profile as { role: string } | null)?.role === "admin"

  // Membership fetched up front (not just after the gate) because the gate
  // itself now needs to know the plan slug - see below.
  let membershipSlug: string | null = null
  let advanceDays = 7

  {
    const { data: membership } = await supabase
      .from("memberships")
      .select("id, started_at, membership_plans(slug, discount_percent, first_year_discount, advance_booking_days)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    membershipSlug = (membership?.membership_plans as { slug: string } | null)?.slug ?? null
    advanceDays = (membership?.membership_plans as { advance_booking_days: number } | null)?.advance_booking_days ?? 7
  }

  // Admin gate: bookings not open to public until launch, with two
  // carve-outs - (1) a founder with an active Founders Day credit can get
  // through starting 8/18 to book their Friends & Founders Day (8/29) slot,
  // even after that credit is fully redeemed (hasFoundersDayCredit alone
  // would go back to false once hours_remaining hits 0, wrongly locking a
  // founder back out), and (2) starting 8/19 00:01 EDT (FOUNDERS_CLUB_DEADLINE),
  // any active founder can get through to book anything from 8/29 onward.
  // The backend (lib/bookings/create.ts) enforces the actual date
  // restriction per-session; this just decides whether to show the booking
  // UI at all, and has to mirror both of create.ts's founder carve-outs or
  // a founder who already used their free hours gets wrongly stuck on the
  // "Coming Soon" screen the moment early access opens.
  const isEarlyAccessOpen = Date.now() >= FOUNDERS_CLUB_DEADLINE.getTime()
  const isFounderPlan = membershipSlug === "founder"

  if (!isAdmin && !(await hasFoundersDayCredit(serviceClient, user.id)) && !(isEarlyAccessOpen && isFounderPlan)) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#00A651] mb-4">Coming Soon</p>
        <h1 className="text-3xl font-bold text-white mb-3">Bookings Available September 2026</h1>
        <p className="text-neutral-400 max-w-sm">
          We&apos;re getting the bays ready. Online booking opens when we do. Check back in September.
        </p>
      </main>
    )
  }

  // Minor consent gate
  const p = profile as { role: string; first_name: string; last_name: string; is_minor: boolean; parental_consent_verified: boolean } | null
  if (p?.is_minor && !p.parental_consent_verified) {
    redirect("/account/awaiting-consent")
  }

  const userName = p ? `${p.first_name} ${p.last_name}` : ""

  const nowIso = new Date().toISOString()
  const [{ data: bays }, { data: disclosures }, { data: hourCredits }] = await Promise.all([
    serviceClient
      .from("bays")
      .select("id, number, name")
      .eq("active", true)
      .order("number"),
    serviceClient
      .from("disclosures")
      .select("id, title, body")
      .eq("active", true)
      .order("created_at"),
    serviceClient
      .from("hour_credits")
      .select("hours_remaining")
      .eq("user_id", user.id)
      .eq("active", true)
      .gt("hours_remaining", 0)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ])

  const availableCreditHours = (hourCredits ?? []).reduce(
    (sum, c) => sum + Number((c as { hours_remaining: number }).hours_remaining), 0)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Book a Bay</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Select a date and time. Payment required to confirm.
      </p>
      <BookingFlow
        bays={bays ?? []}
        advanceDays={advanceDays}
        membershipSlug={membershipSlug}
        userName={userName}
        disclosures={disclosures ?? []}
        isAuthenticated={!!user}
        availableCreditHours={availableCreditHours}
      />
    </main>
  )
}
