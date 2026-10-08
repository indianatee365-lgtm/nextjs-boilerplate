import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, inviteUrl, teeTimeLabel } from "@/lib/league"
import { buildSeason } from "@/lib/league/schedule"
import { planLeagueCharges } from "@/lib/league/charges"
import { easternDateKey } from "@/lib/time/eastern"

export const dynamic = "force-dynamic"
export const metadata = { title: "League | Tee365 Admin" }

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

// Removes a team and both players' signups, freeing the spot. For teams that
// never got their partner, test teams, or someone who backs out before week
// one. Nothing has been charged at signup, so there is nothing to refund.
async function removeTeam(formData: FormData) {
  "use server"
  const service = await requireAdmin()
  const id = String(formData.get("teamId") ?? "")
  if (!id) return
  await service.from("league_participants").delete().eq("team_id", id)
  await service.from("league_teams").delete().eq("id", id)
  revalidatePath("/admin/league")
  revalidatePath("/league")
}

// Gate for the one-time pg_cron job that publishes the league at 8:55am ET on
// Fri Oct 9 and sends the founders announcement at 9:00. If this is off at
// that moment, the job publishes nothing and sends nothing.
async function setLeagueReady(formData: FormData) {
  "use server"
  const service = await requireAdmin()
  await service.from("admin_settings").upsert({ key: "league_ready", value: formData.get("ready") === "true", updated_at: new Date().toISOString() })
  revalidatePath("/admin/league")
}

// Approval switches for the later announcements. The pg_cron jobs send
// nothing unless the matching switch is on and the league is published.
async function setAnnounceApproval(formData: FormData) {
  "use server"
  const service = await requireAdmin()
  const key = String(formData.get("key") ?? "")
  if (key !== "league_members_announce_ok" && key !== "league_public_announce_ok") return
  await service.from("admin_settings").upsert({ key, value: formData.get("value") === "true", updated_at: new Date().toISOString() })
  revalidatePath("/admin/league")
}

// Builds weeks 1-7 from the confirmed teams in each tee time (round robin,
// bays rotating). Allowed until week one starts; regenerating replaces it.
async function generateSchedule() {
  "use server"
  const service = await requireAdmin()
  const { data: league } = await service.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single()
  const leagueId = (league as { id: string }).id
  const { data: weeks } = await service.from("league_weeks").select("id, week_no, play_date").eq("league_id", leagueId).order("week_no")
  const ws = (weeks ?? []) as { id: string; week_no: number; play_date: string }[]
  if (!ws.length || easternDateKey(new Date()) >= ws[0].play_date) return
  const { data: teams } = await service.from("league_teams").select("id, tee_time").eq("league_id", leagueId).eq("status", "confirmed").order("created_at")
  const byTee: Record<string, string[]> = {}
  for (const t of (teams ?? []) as { id: string; tee_time: string }[]) (byTee[t.tee_time] ??= []).push(t.id)
  const season = buildSeason(byTee)
  const weekId = new Map(ws.map((w) => [w.week_no, w.id]))
  await service.from("league_matches").delete().eq("league_id", leagueId)
  if (season.length) {
    await service.from("league_matches").insert(season.map((m) => ({
      league_id: leagueId, week_id: weekId.get(m.weekNo), tee_time: m.teeTime, bay_number: m.bayNumber,
      home_team_id: m.home, away_team_id: m.away,
    })))
  }
  revalidatePath("/admin/league")
}

async function setLeagueActive(formData: FormData) {
  "use server"
  const service = await requireAdmin()
  await service.from("leagues").update({ active: formData.get("active") === "true" }).eq("slug", LEAGUE_SLUG)
  revalidatePath("/admin/league")
  revalidatePath("/league")
}

export default async function AdminLeaguePage() {
  const service = await requireAdmin()
  const { data: league } = await service.from("leagues").select("id, name, active, teams_per_tee_time, tee_times").eq("slug", LEAGUE_SLUG).single()
  const l = league as { id: string; name: string; active: boolean; teams_per_tee_time: number; tee_times: string[] }

  const { data: teams } = await service
    .from("league_teams")
    .select("id, name, tee_time, status, created_at, invite_token, partner_invite_name, captain_pays_for_both, captain:profiles!league_teams_captain_user_id_fkey(first_name, last_name, phone), partner:profiles!league_teams_partner_user_id_fkey(first_name, last_name, phone)")
    .eq("league_id", l.id)
    .order("created_at")
  type P = { first_name: string; last_name: string; phone: string | null } | null
  const rows = (teams ?? []) as {
    id: string; name: string; tee_time: string; status: string; created_at: string; invite_token: string
    partner_invite_name: string | null; captain_pays_for_both: boolean; captain: P; partner: P
  }[]
  const active = rows.filter((r) => r.status === "confirmed" || r.status === "pending_partner")
  const { data: readyRow } = await service.from("admin_settings").select("value").eq("key", "league_ready").maybeSingle()
  const ready = (readyRow as { value: boolean } | null)?.value === true
  // Schedule and next charges, for the commissioner's view.
  const { data: weekRows } = await service.from("league_weeks").select("id, week_no, play_date, course, nine, cancelled").eq("league_id", l.id).order("week_no")
  const weekList = (weekRows ?? []) as { id: string; week_no: number; play_date: string; course: string; nine: string; cancelled: boolean }[]
  const { data: matchRows } = await service.from("league_matches").select("week_id, tee_time, bay_number, home_team_id, away_team_id").eq("league_id", l.id)
  const matches = (matchRows ?? []) as { week_id: string; tee_time: string; bay_number: number | null; home_team_id: string; away_team_id: string | null }[]
  const teamName = new Map(rows.map((r) => [r.id, r.name]))
  const today = easternDateKey(new Date())
  const nextNight = weekList.find((w) => w.play_date >= today && !w.cancelled)
  const chargePlan = nextNight ? await planLeagueCharges(service, nextNight.play_date) : null
  const canGenerate = weekList.length > 0 && today < weekList[0].play_date
  const { data: disputedRows } = await service.from("league_results").select("match_id, dispute_note").eq("status", "disputed")
  const disputed = (disputedRows ?? []) as { match_id: string; dispute_note: string | null }[]

  const { data: approvals } = await service.from("admin_settings").select("key, value").in("key", ["league_members_announce_ok", "league_public_announce_ok"])
  const approved = Object.fromEntries(((approvals ?? []) as { key: string; value: boolean }[]).map((r) => [r.key, r.value === true]))

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{l.name}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {rows.filter((r) => r.status === "confirmed").length} confirmed, {rows.filter((r) => r.status === "pending_partner").length} waiting on a partner,
            {" "}{rows.filter((r) => r.status === "waitlisted").length} waitlisted.
            {" "}{(l.tee_times ?? []).map((t) => `${teeTimeLabel(t)}: ${active.filter((r) => r.tee_time.slice(0, 5) === t.slice(0, 5)).length}/${l.teams_per_tee_time}`).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <a href="/admin/league/card" className="btn-secondary px-4 py-2 text-sm">Print bay card</a>
        <a href="/admin/league/weeks" className="btn-secondary px-4 py-2 text-sm">Weeks and courses</a>
        {!l.active && (
          <form action={setLeagueReady}>
            <input type="hidden" name="ready" value={ready ? "false" : "true"} />
            <button className={ready ? "btn-primary px-4 py-2 text-sm" : "btn-secondary px-4 py-2 text-sm"}
              title="Fri Oct 9: publishes at 8:55am ET and texts/emails founders at 9:00, only if this is on">
              {ready ? "Ready: auto-publish Fri 8:55am is ON" : "Not ready: auto-publish is OFF"}
            </button>
          </form>
        )}
        <form action={setLeagueActive}>
          <input type="hidden" name="active" value={l.active ? "false" : "true"} />
          <button className={l.active ? "btn-secondary px-4 py-2 text-sm" : "btn-primary px-4 py-2 text-sm"}>
            {l.active ? "League is LIVE. Hide it" : "League is hidden. Publish it"}
          </button>
        </form>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {([
          ["league_members_announce_ok", "Members announcement, Mon Oct 12 9am"],
          ["league_public_announce_ok", "Public announcement, Wed Oct 14 9am"],
        ] as const).map(([key, label]) => (
          <form key={key} action={setAnnounceApproval}>
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="value" value={approved[key] ? "false" : "true"} />
            <button className={approved[key] ? "btn-primary px-4 py-2 text-sm" : "btn-secondary px-4 py-2 text-sm"}>
              {label}: {approved[key] ? "APPROVED" : "not approved"}
            </button>
          </form>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr><th className="px-3 py-2">Team</th><th className="px-3 py-2">Captain</th><th className="px-3 py-2">Partner</th><th className="px-3 py-2">Tee</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No teams yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="text-neutral-300">
                <td className="px-3 py-2 font-medium text-white">{r.name}{r.captain_pays_for_both && <div className="text-xs font-normal text-amber-300">Captain pays both</div>}</td>
                <td className="px-3 py-2">{r.captain ? `${r.captain.first_name} ${r.captain.last_name}` : "?"}<div className="text-xs text-neutral-500">{r.captain?.phone}</div></td>
                <td className="px-3 py-2">
                  {r.partner ? `${r.partner.first_name} ${r.partner.last_name}` : <span className="text-amber-300">Invited: {r.partner_invite_name}</span>}
                  <div className="text-xs text-neutral-500">{r.partner ? r.partner.phone : inviteUrl(r.invite_token)}</div>
                </td>
                <td className="px-3 py-2">{teeTimeLabel(r.tee_time)}</td>
                <td className="px-3 py-2">{r.status.replace("_", " ")}</td>
                <td className="px-3 py-2 text-right">
                  <form action={removeTeam}>
                    <input type="hidden" name="teamId" value={r.id} />
                    <button className="text-xs text-red-400 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {disputed.length > 0 && (
        <section className="mt-8 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <h2 className="text-sm font-semibold text-red-200">Disputed scores ({disputed.length})</h2>
          <ul className="mt-2 space-y-1 text-sm text-neutral-200">
            {disputed.map((d) => (
              <li key={d.match_id}>
                <a href={`/league/play?match=${d.match_id}`} className="underline">Fix and confirm</a>: {d.dispute_note ?? "no note"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Schedule</h2>
          {canGenerate && (
            <form action={generateSchedule}>
              <button className="btn-secondary px-4 py-2 text-sm">{matches.length ? "Regenerate schedule" : "Generate schedule"} from confirmed teams</button>
            </form>
          )}
        </div>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No schedule yet. Generate it once signups close (Oct 20). Weeks 1 to 7 are a round robin inside each tee time; week 8 is set from the standings after week 7.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {weekList.filter((w) => matches.some((m) => m.week_id === w.id)).map((w) => (
              <div key={w.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-neutral-300">
                <p className="mb-1 text-sm font-semibold text-white">Week {w.week_no} &middot; {w.course} ({w.nine}){w.cancelled ? " \u00b7 CANCELLED" : ""}</p>
                {matches.filter((m) => m.week_id === w.id).sort((a, b) => a.tee_time.localeCompare(b.tee_time) || (a.bay_number ?? 9) - (b.bay_number ?? 9)).map((m, i) => (
                  <p key={i}>{teeTimeLabel(m.tee_time)} &middot; {m.bay_number ? `Bay ${m.bay_number}` : "Bye"}: {teamName.get(m.home_team_id) ?? "?"}{m.away_team_id ? ` vs ${teamName.get(m.away_team_id) ?? "?"}` : " (bye)"}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Next charges</h2>
        {!nextNight || !chargePlan ? (
          <p className="mt-2 text-sm text-neutral-500">No league nights left.</p>
        ) : (
          <div className="mt-2 text-sm text-neutral-300">
            <p className="text-neutral-400">
              Week {nextNight.week_no}, {new Date(`${nextNight.play_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}, charged that morning around 9 to 10am.
              {" "}{l.active ? "" : "The league is hidden, so nothing would be charged right now."}
            </p>
            {chargePlan.rows.length === 0 ? (
              <p className="mt-2 text-neutral-500">No confirmed teams, so nobody would be charged.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {chargePlan.rows.map((r) => (
                  <li key={r.payerUserId}>{r.payerName}: ${r.amount.toFixed(2)} <span className="text-neutral-500">({r.players.join(", ")}){r.existing ? ` \u00b7 already ${r.existing}` : ""}</span></li>
                ))}
                <li className="pt-1 font-semibold text-white">Total: ${chargePlan.rows.reduce((t, r) => t + r.amount, 0).toFixed(2)}</li>
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
