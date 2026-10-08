import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { COURSE_SCHEDULE, SIM_SETTINGS } from "@/lib/league/rules"

export const dynamic = "force-dynamic"
export const metadata = { title: "League bay card | Tee365 Admin" }

function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/**
 * The card printed for each bay: how players set up a league round in GSPro.
 * Built from lib/league/rules.ts so the card, the rules page and the texts
 * can't disagree. Print with the browser (white background in print).
 */
export default async function LeagueBayCardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const service = await createServiceClient()
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-neutral-200 print:max-w-none print:bg-white print:p-0 print:text-black">
      <p className="mb-4 text-sm text-neutral-400 print:hidden">Print this page (Ctrl+P). One per bay.</p>
      <div className="rounded-2xl border border-white/15 p-6 print:rounded-none print:border-2 print:border-black">
        <p className="text-xs font-bold uppercase tracking-widest">Tee365 Thursday Night League</p>
        <h1 className="mt-1 text-2xl font-bold">League night setup (about 1 minute)</h1>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>In GSPro choose <strong>Local Match</strong>.</li>
          <li><strong>Players</strong> tab: add <strong>Home A</strong>, <strong>Home B</strong>, <strong>Away A</strong>, <strong>Away B</strong>. Your text tells you which one you are. Forward-tee players change their own tee under their name.</li>
          <li><strong>Match Settings</strong> tab: Game Mode <strong>Stroke Play</strong>, tonight&apos;s course and nine (below and in your text), then the settings below. <strong>Handicap Play: Off.</strong></li>
          <li>Play your round. Right after, enter scores at <strong>tee365.org/league</strong>.</li>
        </ol>

        <h2 className="mt-5 text-sm font-bold uppercase tracking-wider">Settings, every week</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {SIM_SETTINGS.map(([k, v]) => (
              <tr key={k} className="border-t border-white/15 print:border-black/30">
                <td className="w-40 py-1.5 pr-3 font-semibold align-top">{k}</td>
                <td className="py-1.5">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-5 text-sm font-bold uppercase tracking-wider">Courses</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {COURSE_SCHEDULE.map((c, i) => (
              <tr key={c.date} className="border-t border-white/15 print:border-black/30">
                <td className="w-32 py-1.5 pr-3 font-semibold">{i === COURSE_SCHEDULE.length - 1 ? "Finale" : `Week ${i + 1}`}, {dayLabel(c.date)}</td>
                <td className="py-1.5">{c.course}, {c.nine}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-5 text-xs">
          Simulator clearly misread a shot? Re-hit it if the other team agrees. Anything else, play it.
          Finish inside two hours; the 7:30 group is waiting. Questions: the commissioner, Jerrod.
        </p>
      </div>
    </main>
  )
}
