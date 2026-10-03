import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getPricingContext } from "@/lib/pricing/engine"
import PricingEditor, { type PricingRule } from "./PricingEditor"

export const metadata = { title: "Pricing | Tee365 Admin" }
export const dynamic = "force-dynamic"

// Keep these labels in one place so the page explains the same rules the engine
// actually applies. If lib/pricing/engine.ts changes its windows, change these.
const PREMIUM_WINDOW = "10:00am to 10:00pm"
const ON_SEASON_MONTHS = "October through March"

export default async function AdminPricingPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data } = await serviceClient
    .from("pricing_rules")
    .select("id, season_type, day_type, time_type, price_per_hour, default_price_per_hour, updated_at")
  const rules = ((data ?? []) as unknown as PricingRule[]).map((r) => ({
    ...r,
    price_per_hour: Number(r.price_per_hour),
    default_price_per_hour: Number(r.default_price_per_hour),
  }))

  // What a customer calling right now would actually be quoted. This is the
  // question the 2026-10-01 caller could not get answered, so it goes at the top
  // rather than being something you work out from the grid yourself.
  const now = new Date()
  const ctx = getPricingContext(now)
  const live = rules.find(
    (r) =>
      r.season_type === ctx.seasonType &&
      r.day_type === ctx.dayType &&
      r.time_type === ctx.timeType,
  )

  const modifiedCount = rules.filter(
    (r) => r.price_per_hour !== r.default_price_per_hour,
  ).length

  const nowLabel = now.toLocaleString("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Pricing</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Hourly bay rates. Changes take effect on the next quote, with no deploy. Membership
        discounts, coupons and hour credits are applied on top of these numbers.
      </p>

      {/* Charging right now */}
      <section className="mt-6 rounded-2xl border border-brand/30 bg-brand/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          Charging right now
        </p>
        {live ? (
          <>
            <p className="mt-2 text-3xl font-semibold text-white">
              ${live.price_per_hour.toFixed(2)}
              <span className="ml-1 text-base font-normal text-neutral-400">per hour</span>
            </p>
            <p className="mt-1 text-sm text-neutral-300">
              {nowLabel} is{" "}
              <span className="text-white">{ctx.seasonType === "on" ? "on season" : "off season"}</span>,{" "}
              <span className="text-white">{ctx.dayType === "weekend" ? "weekend" : "weekday"}</span>,{" "}
              <span className="text-white">
                {ctx.timeType === "premium" ? "premium hours" : "off-peak hours"}
              </span>
              .
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-red-400">
            No pricing row matches {ctx.seasonType}/{ctx.dayType}/{ctx.timeType}. Bookings in this
            window will fail to price. Fix this before taking bookings.
          </p>
        )}
      </section>

      <PricingEditor rules={rules} modifiedCount={modifiedCount} />

      {/* How the buckets are decided, so the grid is self-explanatory */}
      <section className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-sm font-semibold text-white">How a rate gets picked</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-neutral-400">
          <li>
            <span className="text-neutral-200">Season:</span> on season is {ON_SEASON_MONTHS}.
            Everything else is off season.
          </li>
          <li>
            <span className="text-neutral-200">Day:</span> Saturday and Sunday are weekend.
          </li>
          <li>
            <span className="text-neutral-200">Time:</span> premium is {PREMIUM_WINDOW}, based on
            the hour the session starts.
          </li>
          <li className="pt-1 text-neutral-500">
            A session is quoted at the rate for its start time, so a booking that crosses out of
            premium hours is still charged the premium rate throughout.
          </li>
        </ul>
      </section>
    </main>
  )
}
