import { createServiceClient } from "@/lib/supabase/server"
import { FOUNDERS_CLUB_DEADLINE, BIRDIE_EAGLE_LAUNCH } from "@/lib/bookings/launch-gate"
import { CountdownClock } from "@/app/components/ui/CountdownClock"
import { LEAGUE_SLUG, signupClosesAt, signupWindow, type League } from "@/lib/league"

function Bar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="flex items-center justify-center gap-2 w-full text-center text-xs sm:text-sm font-semibold text-black hover:brightness-95 transition py-2 px-4"
      style={{ backgroundColor: "var(--brand)" }}
    >
      {children}
    </a>
  )
}

export default async function AnnouncementBar() {
  const supabase = await createServiceClient()

  // Thursday Night League gets the bar while public signups are open (2026-10-19).
  // League tables are newer than lib/supabase/types.ts, so this query is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leagueRow } = await (supabase as any).from("leagues").select("*").eq("slug", LEAGUE_SLUG).maybeSingle()
  const league = leagueRow as League | null
  const leagueCloses = league ? signupClosesAt(league) : null
  if (league?.active && signupWindow(league) === "public") {
    const starts = new Date(`${league.starts_on}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    return (
      <Bar href="/league">
        <span>Thursday Night League starts {starts} · ${Number(league.price_per_session ?? 0)} a night</span>
        {leagueCloses && (
          <>
            <span className="hidden sm:inline">· Signup closes in</span>
            <CountdownClock deadline={leagueCloses.toISOString()} className="hidden sm:inline tabular-nums" />
          </>
        )}
        <span aria-hidden="true">→</span>
      </Bar>
    )
  }

  const { data: founderPlan } = await supabase
    .from("membership_plans")
    .select("id")
    .eq("slug", "founder")
    .single()

  const { count: founderCount } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", (founderPlan as { id: string } | null)?.id ?? "")
    .in("status", ["active", "past_due"])

  const sold = founderCount ?? 0
  const foundersOpen = new Date() <= FOUNDERS_CLUB_DEADLINE && sold < 100

  if (foundersOpen) {
    const remaining = 100 - sold
    const prefix = sold >= 80
      ? `Only ${remaining} of 100 Founder's Club spots left`
      : `Founder's Club: Lock in lifetime pricing`

    return (
      <Bar href="/founders">
        <span>{prefix} · Closes in</span>
        <CountdownClock deadline={FOUNDERS_CLUB_DEADLINE.toISOString()} className="tabular-nums" />
        <span aria-hidden="true">→</span>
      </Bar>
    )
  }

  if (new Date() < BIRDIE_EAGLE_LAUNCH) {
    return (
      <Bar href="/join">
        <span>Birdie &amp; Eagle memberships open in</span>
        <CountdownClock deadline={BIRDIE_EAGLE_LAUNCH.toISOString()} className="tabular-nums" />
        <span aria-hidden="true">→</span>
      </Bar>
    )
  }

  // Founder's Club deadline passed and Birdie/Eagle already launched - this
  // used to fall through to `return null` (no banner at all), leaving the
  // site with no live call-to-action once Founder's Club closed even though
  // Birdie/Eagle were actually on sale. Found 2026-08-24, days before the
  // real public opening (8/30) - there was no path driving visitors to
  // /join at all.
  return (
    <Bar href="/join">
      <span>Birdie &amp; Eagle memberships are on sale now</span>
      <span aria-hidden="true">→</span>
    </Bar>
  )
}
