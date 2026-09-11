import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingFlow from "./BookingFlow"
import { hasUnusedFriendsDayCoupon, FRIENDS_DAY_COUPON_CODE } from "@/lib/bookings/launch-gate"
import { isInFirstYear } from "@/lib/membership/first-year"

export const metadata = {
  title: "Book a Bay | Tee365",
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const { code: guestCode } = await searchParams
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Preserve ?code=... through the login round-trip - losing it here
    // sent a guest coupon holder to their plain /account page post-login
    // with no way back to the gated link short of re-typing the URL.
    const returnTo = "/book" + (guestCode ? `?code=${encodeURIComponent(guestCode)}` : "")
    redirect(`/login?return=${encodeURIComponent(returnTo)}`) // LAUNCH: remove this line to open tee sheet to public
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role, first_name, last_name, is_minor, parental_consent_verified")
    .eq("id", user.id)
    .single()

  // Drives how far ahead the calendar opens and what discount the quote shows.
  let membershipSlug: string | null = null
  let advanceDays = 7
  let membershipDiscountPercent = 0

  {
    const { data: membership } = await supabase
      .from("memberships")
      .select("id, started_at, year_one_discount_expires_at, membership_plans(slug, discount_percent, first_year_discount, advance_booking_days)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single()

    const plan = membership?.membership_plans as
      { slug: string; discount_percent: number; first_year_discount: number | null; advance_booking_days: number } | null

    membershipSlug = plan?.slug ?? null
    advanceDays = plan?.advance_booking_days ?? 7

    if (plan) {
      const isFirstYear = isInFirstYear(
        membership as { started_at: string; year_one_discount_expires_at?: string | null }
      )
      membershipDiscountPercent =
        isFirstYear && plan.first_year_discount != null ? plan.first_year_discount : plan.discount_percent
    }
  }

  // The pre-launch gate that used to live here (a "Bookings Open August 30"
  // screen plus founder / Friends Day carve-outs around it) came out on
  // 2026-09-11. Every one of its dates is in the past, so it had been letting
  // everyone straight through for two weeks while still costing two DB reads
  // per page load. The real per-session eligibility checks never lived here
  // anyway, they're in lib/bookings/create.ts, and they stay.
  //
  // The Friends Day code is still honored to the extent of prefilling the
  // coupon field, since /account can still redirect someone here with it.
  // Whether it actually applies is create.ts's call, same as any coupon.
  const hasGuestCode = guestCode?.toUpperCase() === FRIENDS_DAY_COUPON_CODE
    && (await hasUnusedFriendsDayCoupon(serviceClient, user.id))

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
        membershipDiscountPercent={membershipDiscountPercent}
        userName={userName}
        disclosures={disclosures ?? []}
        isAuthenticated={!!user}
        availableCreditHours={availableCreditHours}
        prefillCouponCode={hasGuestCode ? FRIENDS_DAY_COUPON_CODE : undefined}
      />
    </main>
  )
}
