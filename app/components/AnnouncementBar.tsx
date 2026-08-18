import { createServiceClient } from "@/lib/supabase/server"
import { FOUNDERS_CLUB_DEADLINE } from "@/lib/bookings/launch-gate"
import { CountdownClock } from "@/app/components/ui/CountdownClock"

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
  const closed = new Date() > FOUNDERS_CLUB_DEADLINE || sold >= 100

  if (closed) return null

  const remaining = 100 - sold
  const showCount = sold >= 80
  const prefix = showCount
    ? `Only ${remaining} of 100 Founder's Club spots left`
    : `Founder's Club: Lock in lifetime pricing`

  return (
    <a
      href="/founders"
      className="flex items-center justify-center gap-2 w-full text-center text-xs sm:text-sm font-semibold text-black hover:brightness-95 transition py-2 px-4"
      style={{ backgroundColor: "var(--brand)" }}
    >
      <span>{prefix} · Closes in</span>
      <CountdownClock deadline={FOUNDERS_CLUB_DEADLINE.toISOString()} className="tabular-nums" />
      <span aria-hidden="true">→</span>
    </a>
  )
}
