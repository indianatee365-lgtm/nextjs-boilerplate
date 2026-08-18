import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { logout } from "@/app/actions/auth"
import PaymentMethodsSection from "./PaymentMethodsSection"
import PersonalInfoSection from "./PersonalInfoSection"
import CancelMembershipSection from "./CancelMembershipSection"
import HourCreditsSection from "./HourCreditsSection"
import Stripe from "stripe"
import { isInFirstYear } from "@/lib/membership/first-year"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export const metadata = { title: "My Account | Tee365" }

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>
}) {
  const { membership: membershipParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const serviceClient = await createServiceClient()

  const nowIso = new Date().toISOString()
  const [{ data: profile }, { data: membership }, { data: upcomingBookings }, { data: hourCredits }] =
    await Promise.all([
      serviceClient.from("profiles").select("first_name, last_name, phone, role, stripe_customer_id, sms_consent").eq("id", user.id).single(),
      serviceClient
        .from("memberships")
        .select("status, started_at, current_period_end, year_one_discount_expires_at, founder_number, signup_bonus_hours, signup_bonus_expires_at, cancellation_requested_at, membership_plans(name, display_name, slug, discount_percent, first_year_discount, advance_booking_days, max_active_reservations)")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from("bookings")
        .select("id, starts_at, ends_at, status, total, access_code, bays(name)")
        .eq("user_id", user.id)
        .gte("starts_at", new Date().toISOString())
        .in("status", ["confirmed", "pending"])
        .order("starts_at")
        .limit(5),
      serviceClient
        .from("hour_credits")
        .select("hours_remaining, expires_at")
        .eq("user_id", user.id)
        .eq("active", true)
        .gt("hours_remaining", 0)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("expires_at", { ascending: true, nullsFirst: false }),
    ])

  const creditRows = (hourCredits ?? []) as { hours_remaining: number; expires_at: string | null }[]
  const availableCreditHours = creditRows.reduce((sum, c) => sum + Number(c.hours_remaining), 0)
  const nextCreditExpiry = creditRows.find((c) => c.expires_at)?.expires_at ?? null

  // Fetch saved payment methods from Stripe, and which one is the default
  // (used for subscription renewals) so the account page can show it and
  // let the customer explicitly change it - not left to only the
  // setup_intent.succeeded webhook, which depends on that event being
  // enabled on the Stripe webhook endpoint.
  const stripeCustomerId = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null
  let defaultPaymentMethodId: string | null = null
  const savedCards = stripeCustomerId
    ? await Promise.all([
        getStripe().customers.listPaymentMethods(stripeCustomerId, { type: "card" }),
        getStripe().customers.retrieve(stripeCustomerId),
      ])
        .then(([methods, customer]) => {
          defaultPaymentMethodId = ("deleted" in customer ? null : customer.invoice_settings?.default_payment_method) as string | null
          return methods.data.map((pm) => ({
            id: pm.id,
            brand: pm.card?.brand ?? "card",
            last4: pm.card?.last4 ?? "????",
            expMonth: pm.card?.exp_month ?? 0,
            expYear: pm.card?.exp_year ?? 0,
            isDefault: pm.id === defaultPaymentMethodId,
          }))
        })
        .catch(() => [])
    : []

  const plan = membership?.membership_plans as {
    name: string; display_name: string | null; slug: string; discount_percent: number; first_year_discount: number | null
    advance_booking_days: number; max_active_reservations: number
  } | null
  const membershipStatus = membership?.status as string | undefined
  const founderNumber = membership?.founder_number as number | null | undefined
  const bonusHours = membership?.signup_bonus_hours as number | null | undefined
  const bonusExpires = membership?.signup_bonus_expires_at as string | null | undefined

  const isFirstYear = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null } | null)

  const discount = plan
    ? (isFirstYear && plan.first_year_discount ? plan.first_year_discount : plan.discount_percent)
    : 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">

      {membershipParam === "joined" && (
        <div className="mb-6 rounded-xl border border-brand/30 bg-brand/10 px-4 py-4">
          <p className="font-semibold text-white">Welcome to the club!</p>
          <p className="text-sm text-neutral-400 mt-0.5">Your membership is active. Discounts apply automatically on your next booking.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">
          Welcome, {profile?.first_name}
        </h1>
        <div className="flex items-center gap-3">
          {profile?.role === "admin" && (
            <Link href="/admin" className="btn-secondary text-xs px-3 py-2">Admin</Link>
          )}
          <form action={logout}>
            <button className="text-xs px-3 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors">Sign out</button>
          </form>
        </div>
      </div>

      {/* Membership badge */}
      {plan ? (
        <div className={`mt-6 rounded-xl border px-4 py-4 ${
          membershipStatus === "past_due" ? "border-red-500/40 bg-red-500/10"
          : membershipStatus === "cancelled" ? "border-white/10 bg-white/5"
          : "border-brand/30 bg-brand/10"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{plan.display_name ?? plan.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {discount}% off every booking
                {isFirstYear && plan.first_year_discount && " (first year rate)"}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              membershipStatus === "past_due" ? "bg-red-500/20 text-red-400"
              : membershipStatus === "cancelled" ? "bg-white/10 text-neutral-400"
              : "bg-brand/20 text-brand"
            }`}>
              {membershipStatus === "past_due" ? "Past due" : membershipStatus === "cancelled" ? "Cancelled" : "Active"}
            </span>
          </div>

          {membershipStatus === "past_due" && (
            <p className="mt-3 text-xs text-red-300">
              Your last renewal payment didn&apos;t go through. Stripe is automatically retrying over the next
              several days — <a href="#payment-method" className="text-brand hover:underline">update your payment
              method below</a> to make sure the next attempt succeeds. Your membership benefits may pause if
              retries keep failing.
            </p>
          )}
          {membershipStatus === "cancelled" && (
            <p className="mt-3 text-xs text-neutral-400">
              This membership is cancelled.
              {founderNumber ? " Your founder number and Founders Wall listing are permanent." : ""}{" "}
              <Link href="/join" className="text-brand hover:underline">Rejoin →</Link>
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-black/20 px-3 py-2">
              <p className="text-neutral-500">Advance booking</p>
              <p className="text-white font-medium mt-0.5">{plan.advance_booking_days} days out</p>
            </div>
            <div className="rounded-lg bg-black/20 px-3 py-2">
              <p className="text-neutral-500">Active reservations</p>
              <p className="text-white font-medium mt-0.5">Up to {plan.max_active_reservations}</p>
            </div>
            {founderNumber && (
              <div className="rounded-lg bg-black/20 px-3 py-2">
                <p className="text-neutral-500">Member number</p>
                <p className="text-brand font-bold mt-0.5">#{founderNumber} of 100</p>
              </div>
            )}
            {bonusHours && bonusExpires && new Date(bonusExpires) > new Date() && (
              <div className="rounded-lg bg-black/20 px-3 py-2">
                <p className="text-neutral-500">Signup bonus</p>
                <p className="text-brand font-medium mt-0.5">{bonusHours} free hrs remaining</p>
              </div>
            )}
          </div>
          {membershipStatus === "active" && membership?.current_period_end && !(membership as { cancellation_requested_at?: string | null }).cancellation_requested_at && (
            <p className="mt-3 text-xs text-neutral-500">
              Renews {new Date(membership.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {membershipStatus !== "cancelled" && (
            <CancelMembershipSection
              planType={plan.slug}
              planName={plan.display_name ?? plan.name}
              isFounder={plan.slug === "founder"}
              founderNumber={founderNumber ?? null}
              pendingCancelEndDate={
                (membership as { cancellation_requested_at?: string | null }).cancellation_requested_at && membership?.current_period_end
                  ? new Date(membership.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
                  : null
              }
            />
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-sm text-neutral-300">No active membership</p>
          <Link href="/join" className="mt-2 inline-block text-xs text-brand hover:underline">
            View membership plans →
          </Link>
        </div>
      )}

      {/* Free hours balance + code redemption */}
      <HourCreditsSection availableHours={availableCreditHours} nextExpiry={nextCreditExpiry} />

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Link href="/book" className="btn-primary flex items-center justify-center py-3">
          Book a bay
        </Link>
        <Link href="/account/bookings" className="btn-secondary flex items-center justify-center py-3">
          My bookings
        </Link>
        <Link href="/gift-cards" className="btn-secondary flex items-center justify-center py-3">
          Gift cards
        </Link>
      </div>

      {/* Upcoming bookings */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Upcoming</h2>
        {upcomingBookings && upcomingBookings.length > 0 ? (
          <div className="space-y-3">
            {upcomingBookings.map((b) => {
              const bay = b.bays as { name: string } | null
              const start = new Date(b.starts_at)
              const end = new Date(b.ends_at)
              return (
                <div key={b.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-white">{bay?.name}</p>
                      <p className="mt-0.5 text-sm text-neutral-400">
                        {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Indiana/Indianapolis" })}{" · "}
                        {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                        {" – "}
                        {end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-white">${Number(b.total).toFixed(2)}</span>
                  </div>
                  {b.access_code && (
                    <div className="mt-3 rounded-lg bg-black/30 px-3 py-2">
                      <p className="text-xs text-neutral-500">Access code</p>
                      <p className="mt-0.5 text-xl font-bold tracking-widest text-brand">{b.access_code}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No upcoming bookings.</p>
        )}
      </div>
      <PaymentMethodsSection cards={savedCards} />
      <PersonalInfoSection
        firstName={profile?.first_name ?? ""}
        lastName={profile?.last_name ?? ""}
        phone={(profile as { phone?: string | null } | null)?.phone ?? null}
        email={user.email ?? ""}
        smsConsent={(profile as { sms_consent?: boolean } | null)?.sms_consent ?? false}
      />
    </main>
  )
}
