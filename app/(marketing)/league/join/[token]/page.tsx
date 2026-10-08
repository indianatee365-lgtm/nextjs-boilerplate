import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { hasCardOnFile, leagueNights, teeTimeLabel, type League } from "@/lib/league"
import JoinTeamForm from "./JoinTeamForm"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Join your team | Tee365 League", robots: { index: false } }

function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data: teamRow } = await service
    .from("league_teams")
    .select("id, name, tee_time, status, partner_user_id, captain_user_id, league_id, captain:profiles!league_teams_captain_user_id_fkey(first_name, last_name)")
    .eq("invite_token", token)
    .maybeSingle()
  const team = teamRow as {
    id: string; name: string; tee_time: string; status: string; partner_user_id: string | null
    captain_user_id: string; league_id: string; captain: { first_name: string; last_name: string } | null
  } | null
  if (!team || team.status === "withdrawn") notFound()

  const { data: leagueRow } = await service.from("leagues").select("*").eq("id", team.league_id).single()
  const league = leagueRow as League
  const nights = leagueNights(league)
  const perWeek = Number(league.price_per_session ?? 0)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const captainName = team.captain ? `${team.captain.first_name} ${team.captain.last_name}`.trim() : "Your captain"

  let state: "sign_in" | "own_team" | "taken" | "already_in" | "ready" | "joined" = "ready"
  let hasCard = false
  if (!user) state = "sign_in"
  else if (team.captain_user_id === user.id) state = "own_team"
  else if (team.partner_user_id === user.id) state = "joined"
  else if (team.partner_user_id) state = "taken"
  else {
    const { data: existing } = await service.from("league_participants").select("id").eq("league_id", team.league_id).eq("user_id", user.id).maybeSingle()
    if (existing) state = "already_in"
    else hasCard = await hasCardOnFile(service, user.id)
  }

  const { data: disclosures } = await service.from("disclosures").select("id, title, body").eq("active", true).order("created_at")
  const skipped = (league.skip_dates ?? []).map(dayLabel)
  const chargeText =
    `I authorize Tee365 to charge my card $${perWeek} on each league night, ${nights.length} nights from ` +
    `${dayLabel(nights[0])} to ${dayLabel(nights[nights.length - 1])}${skipped.length ? ` (no league ${skipped.join(", ")})` : ""}. ` +
    `Once week one tees off I'm in for the season, missed weeks included.`

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">{league.name}</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Join team {team.name}</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">
        {captainName} picked you as their partner. Two-person teams, A/B match play, 9 holes, Thursdays at {teeTimeLabel(team.tee_time)},
        {" "}{dayLabel(nights[0])} to {dayLabel(nights[nights.length - 1])}. ${perWeek} a week each, and 100% of the pot is paid out in cash.
        {" "}<a href="/league/rules" className="text-white underline">Read the rules</a>
      </p>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        {state === "sign_in" && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">Sign in or create a Tee365 account to accept. Every player needs their own account and a card on file.</p>
            <a href={`/login?return=${encodeURIComponent(`/league/join/${token}`)}`} className="btn-primary inline-flex px-5 py-2.5">Sign in to accept</a>
          </div>
        )}
        {state === "own_team" && <p className="text-sm text-neutral-300">This is your team. Send this page&apos;s link to your partner so they can accept.</p>}
        {state === "joined" && <p className="text-sm text-brand">You&apos;re on the team. See you on Thursdays.</p>}
        {state === "taken" && <p className="text-sm text-neutral-300">This team already has its partner. If that seems wrong, ask {captainName}.</p>}
        {state === "already_in" && <p className="text-sm text-neutral-300">You&apos;re already signed up for this league on another team.</p>}
        {state === "ready" && (
          <JoinTeamForm
            token={token}
            hasCard={hasCard}
            chargeText={chargeText}
            disclosures={(disclosures ?? []) as { id: string; title: string; body: string }[]}
          />
        )}
      </div>
    </main>
  )
}
