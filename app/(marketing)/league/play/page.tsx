import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { findPlayerMatchId, loadMatch, playerMaxes } from "@/lib/league/matches"
import { teeTimeLabel } from "@/lib/league"
import ScoreEntry from "./ScoreEntry"
import UnplayedHoles from "./UnplayedHoles"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "League scores | Tee365", robots: { index: false } }

export default async function LeaguePlayPage({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?return=${encodeURIComponent("/league/play")}`)
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).single()
  const isAdmin = (prof as { role: string } | null)?.role === "admin"

  const { match } = await searchParams
  const matchId = (isAdmin && match) ? match : await findPlayerMatchId(db, user.id)
  const view = matchId ? await loadMatch(db, matchId) : null

  if (!view) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-semibold text-white">League scores</h1>
        <p className="mt-3 text-sm text-neutral-300">No match for you yet. Your first one shows up here on league night.</p>
        <Link href="/league/standings" className="mt-4 inline-block text-sm text-brand underline">Standings</Link>
      </main>
    )
  }

  const myTeamId = view.home.players.some((p) => p.userId === user.id) ? view.home.teamId
    : view.away?.players.some((p) => p.userId === user.id) ? view.away.teamId : null
  const status = view.result?.status ?? null
  // The commissioner can fix anything, except his own match, which follows
  // the same rules as everyone else's.
  const commissioner = isAdmin && !myTeamId
  const mode: "enter" | "confirm" | "view" =
    status === "confirmed" ? (commissioner ? "enter" : "view")
    : status === "entered" ? (commissioner || (myTeamId && myTeamId !== view.result!.enteredTeamId) ? "confirm" : "view")
    : status === "disputed" ? (commissioner ? "enter" : "view")
    : "enter"
  const players = [
    ...view.home.players.map((p) => ({ userId: p.userId, name: p.name, teamName: view.home.name, ab: p.ab, handicap: p.handicap })),
    ...(view.away?.players ?? []).map((p) => ({ userId: p.userId, name: p.name, teamName: view.away!.name, ab: p.ab, handicap: p.handicap })),
  ]
  const maxes = playerMaxes(view)
  const startHole = view.week.nine === "Back 9" ? 10 : 1
  const statusLine =
    status === "confirmed" ? `Confirmed. ${view.home.name} ${view.result!.homePoints} pts${view.away ? `, ${view.away.name} ${view.result!.awayPoints} pts` : ""}.`
    : status === "entered" ? (mode === "confirm" ? "The other team entered these. Check them and confirm, or tell us what's wrong." : "Entered. Waiting for the other team to confirm (or it confirms itself after 12 hours).")
    : status === "disputed" ? `Disputed: ${view.result!.disputeNote ?? ""}. The commissioner will sort it out.`
    : "Enter everyone's score, hole by hole, right after your round. The other team confirms."

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">
        Week {view.week.weekNo} &middot; {view.week.kind === "learning" ? "Learning week" : view.week.kind === "finale" ? "Finale" : "A/B match play"}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-white">{view.home.name}{view.away ? ` vs ${view.away.name}` : " (bye)"}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        {view.week.course}, {view.week.nine} &middot; {teeTimeLabel(view.teeTime)}{view.bayNumber ? ` · Bay ${view.bayNumber}` : ""}
      </p>
      <p className="mt-4 text-sm text-neutral-300">{statusLine}</p>
      {commissioner && <p className="mt-1 text-xs text-amber-300">Commissioner view: anything you save is confirmed immediately.</p>}
      <p className="mt-2 text-xs text-neutral-400">
        Max on any hole is net double bogey: par + 2, plus your stroke on that hole. The small number under each box is your max; pick up when you hit it.
        {Object.values(maxes).some((m) => m === null) ? " (This week's holes aren't entered yet, so no max is shown.)" : ""}
      </p>
      {view.unplayed.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">
          Bay problem: hole{view.unplayed.length > 1 ? "s" : ""} {view.unplayed.map((i) => startHole + i).join(", ")} couldn&apos;t be played. They&apos;re halved, and team totals count only the holes played.
        </p>
      )}
      {isAdmin && (
        <div className="mt-4">
          <UnplayedHoles matchId={view.matchId} holesLabel={Array.from({ length: 9 }, (_, i) => startHole + i)} initial={view.unplayed} />
        </div>
      )}
      <div className="mt-5">
        <ScoreEntry
          matchId={view.matchId}
          players={players}
          holesLabel={Array.from({ length: 9 }, (_, i) => startHole + i)}
          pars={Array.from({ length: 9 }, (_, i) => view.week.holes?.[i]?.par ?? null)}
          initial={view.cards}
          initialSubs={view.subs}
          maxes={maxes}
          unplayed={view.unplayed}
          mode={mode}
          canEdit={mode !== "view"}
        />
      </div>
      <Link href="/league/standings" className="mt-6 inline-block text-sm text-brand underline">Standings</Link>
    </main>
  )
}
