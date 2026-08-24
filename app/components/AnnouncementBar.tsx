import { createServiceClient } from "@/lib/supabase/server"
import { FOUNDERS_CLUB_DEADLINE, BIRDIE_EAGLE_LAUNCH } from "@/lib/bookings/launch-gate"
import { CountdownClock } from "@/app/components/ui/CountdownClock"

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
