import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, inviteUrl, teeTimeLabel } from "@/lib/league"

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
    .select("id, name, tee_time, status, created_at, invite_token, partner_invite_name, captain:profiles!league_teams_captain_user_id_fkey(first_name, last_name, phone), partner:profiles!league_teams_partner_user_id_fkey(first_name, last_name, phone)")
    .eq("league_id", l.id)
    .order("created_at")
  type P = { first_name: string; last_name: string; phone: string | null } | null
  const rows = (teams ?? []) as {
    id: string; name: string; tee_time: string; status: string; created_at: string; invite_token: string
    partner_invite_name: string | null; captain: P; partner: P
  }[]
  const active = rows.filter((r) => r.status === "confirmed" || r.status === "pending_partner")

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
        <form action={setLeagueActive}>
          <input type="hidden" name="active" value={l.active ? "false" : "true"} />
          <button className={l.active ? "btn-secondary px-4 py-2 text-sm" : "btn-primary px-4 py-2 text-sm"}>
            {l.active ? "League is LIVE. Hide it" : "League is hidden. Publish it"}
          </button>
        </form>
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
                <td className="px-3 py-2 font-medium text-white">{r.name}</td>
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
    </main>
  )
}
