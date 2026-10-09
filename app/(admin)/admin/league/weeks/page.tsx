import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import Stripe from "stripe"
import { LEAGUE_SLUG } from "@/lib/league"
import { logFailure, notifyOwner } from "@/lib/observability/notify"

export const dynamic = "force-dynamic"
export const metadata = { title: "League weeks | Tee365 Admin" }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")
  return service
}

// Saves one week: course, nine, the nine holes' par and hole handicap (from
// the GSPro scorecard), and whether the night is cancelled.
async function saveWeek(formData: FormData) {
  "use server"
  const service = await requireAdmin()
  const id = String(formData.get("id") ?? "")
  const holes = Array.from({ length: 9 }, (_, i) => ({
    n: i + 1,
    par: Number(formData.get(`par${i}`)) || null,
    hcp: Number(formData.get(`hcp${i}`)) || null,
  }))
  const complete = holes.every((h) => h.par && h.hcp)
  const cancelled = formData.get("cancelled") === "on"
  const { data: before } = await service.from("league_weeks").select("cancelled, week_no").eq("id", id).single()
  await service.from("league_weeks").update({
    course: String(formData.get("course") ?? "").trim(),
    nine: String(formData.get("nine") ?? "Front 9"),
    holes: complete ? holes : holes.filter((h) => h.par || h.hcp).length ? holes : [],
    cancelled,
  }).eq("id", id)

  // Rules: if Tee365 cancels a night, nobody pays for it. If that morning's
  // charges already ran, refund every one of them now.
  if (cancelled && !(before as { cancelled: boolean }).cancelled) {
    const { data: paid } = await service.from("league_charges").select("id, stripe_payment_intent_id, amount").eq("week_id", id).eq("status", "succeeded")
    const rows = (paid ?? []) as { id: string; stripe_payment_intent_id: string | null; amount: number }[]
    if (rows.length) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
      let refunded = 0
      for (const c of rows) {
        try {
          if (c.stripe_payment_intent_id) await stripe.refunds.create({ payment_intent: c.stripe_payment_intent_id }, { idempotencyKey: `league-refund-${c.id}` })
          await service.from("league_charges").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", c.id)
          refunded++
        } catch (e) {
          await logFailure(service, "league-cancel-refund-FAILED", `charge=${c.id} err=${String(e).slice(0, 200)}`,
            `League night cancelled but a $${Number(c.amount).toFixed(2)} refund FAILED (charge ${c.id}). Refund it by hand in Stripe.`)
        }
      }
      await notifyOwner(`League week ${(before as { week_no: number }).week_no} cancelled: ${refunded} of ${rows.length} charges refunded automatically.`)
    }
  }
  revalidatePath("/admin/league/weeks")
}

export default async function LeagueWeeksPage() {
  const service = await requireAdmin()
  const { data: league } = await service.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single()
  const { data: weeks } = await service.from("league_weeks").select("*").eq("league_id", (league as { id: string }).id).order("week_no")
  type Week = { id: string; week_no: number; play_date: string; kind: string; course: string; nine: string; holes: { par: number | null; hcp: number | null }[]; cancelled: boolean }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/admin/league" className="text-sm text-neutral-400 hover:text-white">&larr; League</Link>
      <h1 className="mt-2 text-2xl font-semibold text-white">Weeks and courses</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Enter each nine&apos;s par and hole handicap from the GSPro scorecard (the hole handicap is the 1 to 18 difficulty number on the card).
        Needed before week 3, when handicap strokes start. Cancelling a night means nobody is charged and no points are awarded.
      </p>
      <div className="mt-6 space-y-4">
        {((weeks ?? []) as Week[]).map((w) => {
          const filled = (w.holes ?? []).filter((h) => h.par && h.hcp).length
          return (
            <form key={w.id} action={saveWeek} className={`rounded-xl border p-4 ${w.cancelled ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/5"}`}>
              <input type="hidden" name="id" value={w.id} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="text-sm font-semibold text-white">
                  {w.kind === "finale" ? "Finale" : `Week ${w.week_no}`} &middot; {new Date(`${w.play_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                  <div className="text-xs font-normal text-neutral-500">{w.kind === "learning" ? "Learning week" : w.kind === "finale" ? "Position round" : "A/B match play"} &middot; holes entered: {filled}/9</div>
                </div>
                <label className="text-xs text-neutral-400">Course
                  <input name="course" defaultValue={w.course} className="input mt-1 w-56" />
                </label>
                <label className="text-xs text-neutral-400">Nine
                  <select name="nine" defaultValue={w.nine} className="input mt-1 w-28">
                    <option>Front 9</option><option>Back 9</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-red-300">
                  <input type="checkbox" name="cancelled" defaultChecked={w.cancelled} className="h-4 w-4" /> Night cancelled
                </label>
                <button className="btn-primary ml-auto px-4 py-2 text-sm">Save</button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="text-xs text-neutral-300">
                  <tbody>
                    <tr><td className="pr-2 text-neutral-500">Hole</td>{Array.from({ length: 9 }, (_, i) => <td key={i} className="px-1 text-center">{w.nine === "Back 9" ? i + 10 : i + 1}</td>)}</tr>
                    <tr><td className="pr-2 text-neutral-500">Par</td>{Array.from({ length: 9 }, (_, i) => (
                      <td key={i} className="px-1"><input name={`par${i}`} inputMode="numeric" aria-label={`Par hole ${i + 1}`} defaultValue={w.holes?.[i]?.par ?? ""} className="w-11 rounded border border-white/10 bg-black/30 px-1 py-1 text-center text-white" /></td>
                    ))}</tr>
                    <tr><td className="pr-2 text-neutral-500">Hcp</td>{Array.from({ length: 9 }, (_, i) => (
                      <td key={i} className="px-1"><input name={`hcp${i}`} inputMode="numeric" aria-label={`Handicap hole ${i + 1}`} defaultValue={w.holes?.[i]?.hcp ?? ""} className="w-11 rounded border border-white/10 bg-black/30 px-1 py-1 text-center text-white" /></td>
                    ))}</tr>
                  </tbody>
                </table>
              </div>
            </form>
          )
        })}
      </div>
    </main>
  )
}
