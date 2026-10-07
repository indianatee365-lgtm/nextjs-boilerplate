import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingFlow from "./BookingFlow"
import { hasUnusedFriendsDayCoupon, FRIENDS_DAY_COUPON_CODE } from "@/lib/bookings/launch-gate"
import { isInFirstYear } from "@/lib/membership/first-year"
import { getVeteranDiscountPercent } from "@/lib/pricing/veteran"
import { groundsCrewDateKey } from "@/lib/membership/grounds-crew"
import { holdsBayFilter } from "@/lib/bookings/pending-hold"
import { isTwoBayBookingOn } from "@/lib/bookings/group"

export const metadata = {
  title: "Book a Bay | Tee365",
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const { code: guestCode, date: dateParam, duration: durationParam } = await searchParams
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  // The tee sheet is public. Jerrod advertises straight to /book, and a login
  // wall before anyone can see whether there is even a 7pm Saturday free was
  // killing that. Browsing is open; identity is still required to reserve,
  // which BookingFlow enforces by sending a guest to /login at that point.
  //
  // Nothing new is exposed by this: /api/availability has always been public
  // and unauthenticated, so the slot grid and pricing were already readable by
  // anyone. And no new write surface opens either, because /api/bookings still
  // requires a session.
  //
  // Everything below that used to come off the session now falls back to what
  // a non-member sees: 7-day advance window, list price, no credits.
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await serviceClient
        .from("profiles")
        .select("role, first_name, last_name, is_minor, parental_consent_verified")
        .eq("id", user.id)
        .single()
    : { data: null }

  // Drives how far ahead the calendar opens and what discount the quote shows.
  let membershipSlug: string | null = null
  let advanceDays = 7
  let membershipDiscountPercent = 0
  let groundsCrewAllowanceMinutes = 0
  const veteranDiscountPercent = await getVeteranDiscountPercent(serviceClient, user?.id)

  {
    const { data: membership } = user
      ? await supabase
          .from("memberships")
          .select("id, started_at, year_one_discount_expires_at, membership_plans(slug, discount_percent, first_year_discount, advance_booking_days, grounds_crew_daily_hours)")
          .eq("user_id", user.id)
          .eq("status", "active")
          .single()
      : { data: null }

    const plan = membership?.membership_plans as
      { slug: string; discount_percent: number; first_year_discount: number | null; advance_booking_days: number; grounds_crew_daily_hours: number | null } | null

    membershipSlug = plan?.slug ?? null
    advanceDays = plan?.advance_booking_days ?? 7
    groundsCrewAllowanceMinutes = Math.round(Number(plan?.grounds_crew_daily_hours ?? 0) * 60)

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
  const hasGuestCode = !!user
    && guestCode?.toUpperCase() === FRIENDS_DAY_COUPON_CODE
    && (await hasUnusedFriendsDayCoupon(serviceClient, user.id))

  // Minor consent gate
  const p = profile as { role: string; first_name: string; last_name: string; is_minor: boolean; parental_consent_verified: boolean } | null
  if (p?.is_minor && !p.parental_consent_verified) {
    redirect("/account/awaiting-consent")
  }

  const userName = p ? `${p.first_name} ${p.last_name}` : ""
  // "Add a second bay": admins always (the preview), everyone once the
  // switch on /admin/settings is on.
  const twoBayEnabled = p?.role === "admin" || (await isTwoBayBookingOn(serviceClient))

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
    user
      ? serviceClient
          .from("hour_credits")
          .select("hours_remaining")
          .eq("user_id", user.id)
          .eq("active", true)
          .gt("hours_remaining", 0)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      : Promise.resolve({ data: [] }),
  ])

  // Grounds Crew minutes this member already holds per morning, so the price
  // preview takes off exactly what the server will. Free time can only be
  // booked 24 hours out, so today and the next two mornings cover it.
  const groundsCrewUsedByDay: Record<string, number> = {}
  if (user && groundsCrewAllowanceMinutes > 0) {
    const { data: ownFree } = await serviceClient
      .from("bookings")
      .select("starts_at, grounds_crew_minutes")
      .eq("user_id", user.id)
      .gt("grounds_crew_minutes", 0)
      .or(holdsBayFilter())
      .gte("starts_at", new Date(new Date(nowIso).getTime() - 24 * 3600 * 1000).toISOString())
    for (const b of (ownFree ?? []) as { starts_at: string; grounds_crew_minutes: number }[]) {
      const key = groundsCrewDateKey(new Date(b.starts_at))
      groundsCrewUsedByDay[key] = (groundsCrewUsedByDay[key] ?? 0) + Number(b.grounds_crew_minutes)
    }
  }

  const availableCreditHours = (hourCredits ?? []).reduce(
    (sum, c) => sum + Number((c as { hours_remaining: number }).hours_remaining), 0)

  // The phone agent texts /book?date=YYYY-MM-DD&duration=MINUTES so a caller
  // lands on the real tee sheet with their request already filled in. Both are
  // validated here rather than trusted: a stale or malformed link quietly falls
  // back to the normal empty flow instead of opening on a broken or empty grid.
  let prefillDate: string | null = null
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const [y, m, d] = dateParam.split("-").map(Number)
    const asked = new Date(y, m - 1, d)
    const earliest = new Date()
    earliest.setHours(0, 0, 0, 0)
    const latest = new Date(earliest)
    latest.setDate(latest.getDate() + advanceDays)
    if (!Number.isNaN(asked.getTime()) && asked >= earliest && asked <= latest) {
      prefillDate = dateParam
    }
  }

  const askedDuration = durationParam ? parseInt(durationParam, 10) : NaN
  const prefillDurationMinutes =
    Number.isFinite(askedDuration) &&
    askedDuration >= 60 &&
    askedDuration <= 240 &&
    askedDuration % 30 === 0
      ? askedDuration
      : null

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
        veteranDiscountPercent={veteranDiscountPercent}
        userName={userName}
        disclosures={disclosures ?? []}
        isAuthenticated={!!user}
        availableCreditHours={availableCreditHours}
        groundsCrewAllowanceMinutes={groundsCrewAllowanceMinutes}
        groundsCrewUsedByDay={groundsCrewUsedByDay}
        twoBayEnabled={twoBayEnabled}
        prefillCouponCode={hasGuestCode ? FRIENDS_DAY_COUPON_CODE : undefined}
        prefillDate={prefillDate}
        prefillDurationMinutes={prefillDurationMinutes}
      />
    </main>
  )
}
