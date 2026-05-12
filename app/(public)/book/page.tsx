import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingFlow from "./BookingFlow"

export const metadata = {
  title: "Book a Bay | Tee365",
}

export default async function BookPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login") // LAUNCH: remove this line to open tee sheet to public

  // Minor consent gate — conditional on user so it survives when auth gate is removed
  if (user) {
    const { data: minorCheck } = await serviceClient
      .from("profiles")
      .select("is_minor, parental_consent_verified")
      .eq("id", user.id)
      .single()
    const needsConsent = (minorCheck as { is_minor: boolean; parental_consent_verified: boolean } | null)
    if (needsConsent?.is_minor && !needsConsent?.parental_consent_verified) {
      redirect("/account/awaiting-consent")
    }
  }

  let membershipSlug: string | null = null
  let advanceDays = 7
  let userName = ""

  {
    const [{ data: profile }, { data: membership }] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("memberships")
        .select("id, started_at, membership_plans(slug, discount_percent, first_year_discount, advance_booking_days)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single(),
    ])

    if (profile) userName = `${profile.first_name} ${profile.last_name}`
    membershipSlug = (membership?.membership_plans as { slug: string } | null)?.slug ?? null
    advanceDays = (membership?.membership_plans as { advance_booking_days: number } | null)?.advance_booking_days ?? 7
  }

  const [{ data: bays }, { data: disclosures }] = await Promise.all([
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
  ])

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
      />
    </main>
  )
}
