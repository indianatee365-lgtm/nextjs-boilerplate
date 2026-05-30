import { createServiceClient } from "@/lib/supabase/server"

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
  const closed = new Date() > new Date("2026-08-18T23:59:59-04:00") || sold >= 100

  if (closed) return null

  const remaining = 100 - sold
  const showCount = sold >= 80
  const message = showCount
    ? `Only ${remaining} of 100 Founder's Club spots left · Closes Aug 18 →`
    : `Founder's Club — Lock in lifetime pricing · Closes Aug 18 →`

  return (
    <a
      href="/founders"
      className="block w-full text-center text-xs sm:text-sm font-semibold text-black hover:brightness-95 transition py-2 px-4"
      style={{ backgroundColor: "var(--brand)" }}
    >
      {message}
    </a>
  )
}
