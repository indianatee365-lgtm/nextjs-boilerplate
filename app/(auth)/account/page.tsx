import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { logout } from "@/app/actions/auth"

export const metadata = { title: "My Account | Tee365" }

export default async function AccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const serviceClient = await createServiceClient()

  const [{ data: profile }, { data: membership }, { data: upcomingBookings }] =
    await Promise.all([
      supabase.from("profiles").select("first_name, last_name, phone, role").eq("id", user.id).single(),
      serviceClient
        .from("memberships")
        .select("status, started_at, current_period_end, membership_plans(name, slug, discount_percent, first_year_discount)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single(),
      serviceClient
        .from("bookings")
        .select("id, starts_at, ends_at, status, total, access_code, bays(name)")
        .eq("user_id", user.id)
        .gte("starts_at", new Date().toISOString())
        .in("status", ["confirmed", "pending"])
        .order("starts_at")
        .limit(5),
    ])

  const plan = membership?.membership_plans as {
    name: string; slug: string; discount_percent: number; first_year_discount: number | null
  } | null

  const isFirstYear = membership
    ? new Date() < new Date(new Date(membership.started_at).setFullYear(new Date(membership.started_at).getFullYear() + 1))
    : false

  const discount = plan
    ? (isFirstYear && plan.first_year_discount ? plan.first_year_discount : plan.discount_percent)
    : 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">
          Welcome, {profile?.first_name}
        </h1>
        <div className="flex gap-3">
          {profile?.role === "admin" && (
            <Link href="/admin" className="btn-secondary text-xs px-3 py-2">Admin</Link>
          )}
          <Link href="/reset-password" className="btn-ghost px-3 py-2 text-xs">Change password</Link>
          <form action={logout}>
            <button className="btn-ghost px-3 py-2 text-xs">Sign out</button>
          </form>
        </div>
      </div>

      {/* Membership badge */}
      {plan ? (
        <div className="mt-6 rounded-xl border border-brand/30 bg-brand/10 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{plan.name}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {discount}% off every booking
                {isFirstYear && plan.first_year_discount && " (first year rate)"}
              </p>
            </div>
            <span className="rounded-full bg-brand/20 px-3 py-1 text-xs font-semibold text-brand uppercase tracking-wider">
              Active
            </span>
          </div>
          {membership?.current_period_end && (
            <p className="mt-2 text-xs text-neutral-500">
              Renews {new Date(membership.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-sm text-neutral-300">No active membership</p>
          <Link href="/membership" className="mt-2 inline-block text-xs text-brand hover:underline">
            View membership plans →
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link href="/book" className="btn-primary flex items-center justify-center py-3">
          Book a bay
        </Link>
        <Link href="/account/bookings" className="btn-secondary flex items-center justify-center py-3">
          All bookings
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
    </main>
  )
}
