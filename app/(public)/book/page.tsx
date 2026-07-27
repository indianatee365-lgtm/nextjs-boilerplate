import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingFlow from "./BookingFlow"
import { hasFoundersDayCredit } from "@/lib/bookings/launch-gate"

export const metadata = {
  title: "Book a Bay | Tee365",
}

export default async function BookPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login") // LAUNCH: remove this line to open tee sheet to public

  // Admin gate: bookings not open to public until launch, with one
  // carve-out - a founder with an active Founders Day credit can get
  // through starting 8/18 to book their Friends & Founders Day (8/29)
  // slot. The backend (lib/bookings/create.ts) enforces the actual date
  // restriction; this just decides whether to show the booking UI at all.
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role, first_name, last_name, is_minor, parental_consent_verified")
    .eq("id", user.id)
    .single()

  const isAdmin = (profile as { role: string } | null)?.role === "admin"

  if (!isAdmin && !(await hasFoundersDayCredit(serviceClient, user.id))) {
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

  let membershipSlug: string | null = null
  let advanceDays = 7
  const userName = p ? `${p.first_name} ${p.last_name}` : ""

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
