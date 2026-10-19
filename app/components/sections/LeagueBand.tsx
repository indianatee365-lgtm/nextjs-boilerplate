import Link from "next/link"
import Section from "../ui/Section"
import { createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, leagueNights, signupWindow, type League } from "@/lib/league"

// Home page ad for the Thursday Night League (2026-10-19). Dates and price
// come from the leagues row, so this stays right when the season moves.
// Hidden when the league is off or signups have closed.

function dayLabel(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
}

export default async function LeagueBand() {
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data } = await service.from("leagues").select("*").eq("slug", LEAGUE_SLUG).maybeSingle()
  const league = data as League | null
  if (!league || !league.active) return null
  const window = signupWindow(league)
  if (window === "closed" || window === "not_open") return null

  const nights = leagueNights(league)
  const perNight = Number(league.price_per_session ?? 0)
  const facts = [
    { label: "Starts", value: dayLabel(league.starts_on, { weekday: "short", month: "short", day: "numeric" }) },
    { label: "Season", value: `${nights.length} Thursdays` },
    { label: "Per player", value: `$${perNight} a night` },
    ...(league.signup_closes_on
      ? [{ label: "Signup closes", value: dayLabel(league.signup_closes_on, { month: "short", day: "numeric" }) }]
      : []),
  ]

  return (
    <Section glowSide="right">
      <div className="rounded-3xl border border-[color:var(--brandLine)] bg-black/40 p-8 md:p-12">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--brand)" }}>
          Now signing up
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Thursday Night League
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-300 md:text-base">
          Grab a partner and play for something. Two-person teams, 9 holes on a new course every week,
          A/B match play with handicaps, and 100% of the pot paid out in cash.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <dt className="text-xs uppercase tracking-wider text-neutral-400">{f.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-white">{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/league"
            className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            See the rules and sign up
          </Link>
          <span className="text-sm text-neutral-400">No partner? Join the free agent list and we will pair you up.</span>
        </div>
      </div>
    </Section>
  )
}
