import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Stripe from "stripe"
import { isInFirstYear } from "@/lib/membership/first-year"
import PaymentMethodsSection from "@/app/(auth)/account/PaymentMethodsSection"
import PersonalInfoSection from "@/app/(auth)/account/PersonalInfoSection"
import CancelMembershipSection from "@/app/(auth)/account/CancelMembershipSection"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

export const metadata = { title: "Customer dashboard view | Tee365 Admin" }
export const dynamic = "force-dynamic"

export default async function AdminUserDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: meProfile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((meProfile as { role: string } | null)?.role !== "admin") redirect("/account")

  const [{ data: profile }, { data: authUser }, { data: membership }, { data: upcomingBookings }] = await Promise.all([
    serviceClient.from("profiles").select("first_name, last_name, phone, role, stripe_customer_id, sms_consent").eq("id", id).single(),
    serviceClient.auth.admin.getUserById(id),
    serviceClient
      .from("memberships")
      .select("status, started_at, current_period_end, year_one_discount_expires_at, founder_number, signup_bonus_hours, signup_bonus_expires_at, cancellation_requested_at, membership_plans(name, display_name, slug, discount_percent, first_year_discount, advance_booking_days, max_active_reservations)")
      .eq("user_id", id).eq("status", "active").single(),
    serviceClient
      .from("bookings")
      .select("id, starts_at, ends_at, status, total, access_code, bays(name)")
      .eq("user_id", id).gte("starts_at", new Date().toISOString())
      .in("status", ["confirmed", "pending"]).order("starts_at").limit(5),
  ])
  if (!profile) notFound()

  const targetEmail = authUser?.user?.email ?? ""

  const stripeCustomerId = (profile as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null
  const savedCards = stripeCustomerId
    ? await getStripe().customers.listPaymentMethods(stripeCustomerId, { type: "card" })
        .then((r) => r.data.map((pm) => ({
          id: pm.id, brand: pm.card?.brand ?? "card",
          last4: pm.card?.last4 ?? "????",
          expMonth: pm.card?.exp_month ?? 0, expYear: pm.card?.exp_year ?? 0,
        })))
        .catch(() => [])
    : []

  const plan = membership?.membership_plans as {
    name: string; display_name: string | null; slug: string; discount_percent: number; first_year_discount: number | null
    advance_booking_days: number; max_active_reservations: number
  } | null
  const founderNumber = membership?.founder_number as number | null | undefined
  const bonusHours = membership?.signup_bonus_hours as number | null | undefined
  const bonusExpires = membership?.signup_bonus_expires_at as string | null | undefined
  const isFirstYear = isInFirstYear(membership as { started_at: string; year_one_discount_expires_at?: string | null } | null)
  const discount = plan ? (isFirstYear && plan.first_year_discount ? plan.first_year_discount : plan.discount_percent) : 0
  const pendingCancel = (membership as { cancellation_requested_at?: string | null })?.cancellation_requested_at

  return (
    <>
      {/* Admin context: interactive */}
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">Admin view &mdash; read only</p>
            <p className="text-sm text-neutral-200 mt-1">Viewing as <strong>{profile.first_name} {profile.last_name}</strong> &middot; {targetEmail}</p>
          </div>
          <Link href={`/admin/users/${id}`} className="text-xs text-neutral-300 hover:text-white">&larr; Back to user</Link>
        </div>
      </div>

      {/* Faithful mirror: wrapped inert. Clicks/forms blocked; text selectable; visuals identical to /account. */}
      <div inert>
        <main className="mx-auto max-w-3xl px-4 py-10">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">Welcome, {profile.first_name}</h1>
            <div className="flex items-center gap-3">
              {profile.role === "admin" && (
                <span className="btn-secondary text-xs px-3 py-2">Admin</span>
              )}
              <button className="text-xs px-3 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors">Sign out</button>
            </div>
          </div>

          {/* Membership card */}
          {plan ? (
            <div className="mt-6 rounded-xl border border-brand/30 bg-brand/10 px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{plan.display_name ?? plan.name}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {discount}% off every booking{isFirstYear && plan.first_year_discount && " (first year rate)"}
                  </p>
                </div>
                <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand uppercase tracking-wider">Active</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-black/20 px-3 py-2"><p className="text-neutral-500">Advance booking</p><p className="text-white font-medium mt-0.5">{plan.advance_booking_days} days out</p></div>
                <div className="rounded-lg bg-black/20 px-3 py-2"><p className="text-neutral-500">Active reservations</p><p className="text-white font-medium mt-0.5">Up to {plan.max_active_reservations}</p></div>
                {founderNumber && <div className="rounded-lg bg-black/20 px-3 py-2"><p className="text-neutral-500">Member number</p><p className="text-brand font-bold mt-0.5">#{founderNumber} of 100</p></div>}
                {bonusHours && bonusExpires && new Date(bonusExpires) > new Date() && <div className="rounded-lg bg-black/20 px-3 py-2"><p className="text-neutral-500">Signup bonus</p><p className="text-brand font-medium mt-0.5">{bonusHours} free hrs remaining</p></div>}
              </div>
              {membership?.current_period_end && !pendingCancel && (
                <p className="mt-3 text-xs text-neutral-500">Renews {new Date(membership.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
              )}
              <CancelMembershipSection
                planType={plan.slug}
                planName={plan.display_name ?? plan.name}
                isFounder={plan.slug === "founder"}
                founderNumber={founderNumber ?? null}
                pendingCancelEndDate={
                  pendingCancel && membership?.current_period_end
                    ? new Date(membership.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
                    : null
                }
              />
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-sm text-neutral-300">No active membership</p>
              <span className="mt-2 inline-block text-xs text-brand hover:underline">View membership plans &rarr;</span>
            </div>
          )}

          {/* Quick actions */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <span className="btn-primary flex items-center justify-center py-3">Book a bay</span>
            <span className="btn-secondary flex items-center justify-center py-3">My bookings</span>
            <span className="btn-secondary flex items-center justify-center py-3">Gift cards</span>
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
                            {" – "}{end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
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
            ) : <p className="text-sm text-neutral-500">No upcoming bookings.</p>}
          </div>

          <PaymentMethodsSection cards={savedCards} />
          <PersonalInfoSection
            firstName={profile.first_name ?? ""}
            lastName={profile.last_name ?? ""}
            phone={profile.phone ?? null}
            email={targetEmail}
            smsConsent={profile.sms_consent ?? false}
          />
        </main>
      </div>
    </>
  )
}
