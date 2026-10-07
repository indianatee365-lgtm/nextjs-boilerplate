import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import {
  COMMISSIONER_NAME,
  COMMISSIONER_PHONE_DISPLAY,
  COMMISSIONER_PHONE_TEL,
  LEAGUE_SLUG,
  activePlanSlug,
  canStartTeam,
  hasCardOnFile,
  inviteUrl,
  leagueNights,
  normalizeTeeTime,
  signupWindow,
  teamsPerTeeTime,
  teeTimeLabel,
  type League,
} from "@/lib/league"
import LeagueSignup, { type MyTeam } from "./LeagueSignup"

export const dynamic = "force-dynamic"

const DESCRIPTION =
  "Thursday Night League at Tee365 in Mishawaka. Two-person scramble, 9 holes, 8 weeks from October 22. $30 a week, and 100% of the pot is paid out in cash."

export const metadata: Metadata = {
  title: "Thursday Night Golf League | Tee365 Indoor Golf Simulator",
  description: DESCRIPTION,
  alternates: { canonical: "https://tee365.org/league" },
  openGraph: {
    type: "website",
    title: "Thursday Night Golf League | Tee365 Indoor Golf Simulator",
    description: DESCRIPTION,
    url: "https://tee365.org/league",
    images: [{ url: "https://tee365.org/hero.jpg" }],
    siteName: "Tee365",
    locale: "en_US",
  },
}

const TZ = "America/Indiana/Indianapolis"

// YYYY-MM-DD is a calendar day; build it at noon UTC so no timezone shifts it.
function dayLabel(key: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" })
}
function instantLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ })
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

export default async function LeaguePage() {
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data: leagueRow } = await service.from("leagues").select("*").eq("slug", LEAGUE_SLUG).maybeSingle()
  const league = leagueRow as League | null
  if (!league) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isAdmin = false
  if (user) {
    const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle()
    isAdmin = (profile as { role: string } | null)?.role === "admin"
  }
  // A draft until active is turned on: admins and anyone on the league's
  // preview list (preview_user_ids, view only) see it, everyone else 404s.
  const isPreviewer = Boolean(user && (league.preview_user_ids ?? []).includes(user.id))
  if (!league.active && !isAdmin && !isPreviewer) notFound()

  const nights = leagueNights(league)
  const weeks = nights.length
  const perWeek = Number(league.price_per_session ?? 0)
  const potPerWeek = Number(league.prize_pool_per_session ?? 0)
  const maxPlayers = league.max_players ?? 32
  const fullPot = potPerWeek * maxPlayers * weeks
  const teeTimes = (league.tee_times ?? ["17:30", "19:30"]).map(normalizeTeeTime)
  const counts = await teamsPerTeeTime(service, league.id)
  const teamsLeft = teeTimes.reduce((sum, t) => sum + Math.max(league.teams_per_tee_time - (counts[t] ?? 0), 0), 0)
  const window = signupWindow(league)

  // Who is looking, and where they stand.
  let myTeam: MyTeam | null = null
  let canStart = false
  let hasCard = false
  if (user) {
    const { data: mine } = await service
      .from("league_participants").select("team_id, role").eq("league_id", league.id).eq("user_id", user.id).maybeSingle()
    const m = mine as { team_id: string | null; role: "captain" | "partner" | null } | null
    if (m?.team_id) {
      const { data: t } = await service.from("league_teams")
        .select("name, tee_time, status, invite_token, partner_invite_name, captain:profiles!league_teams_captain_user_id_fkey(first_name), partner:profiles!league_teams_partner_user_id_fkey(first_name)")
        .eq("id", m.team_id).single()
      const team = t as {
        name: string; tee_time: string; status: MyTeam["status"]; invite_token: string; partner_invite_name: string | null
        captain: { first_name: string } | null; partner: { first_name: string } | null
      } | null
      if (team) {
        myTeam = {
          name: team.name,
          role: m.role ?? "captain",
          teeTime: teeTimeLabel(team.tee_time),
          status: team.status,
          captainName: team.captain?.first_name ?? "Captain",
          partnerName: team.partner?.first_name ?? team.partner_invite_name ?? "your partner",
          inviteLink: m.role === "captain" ? inviteUrl(team.invite_token) : null,
        }
      }
    } else {
      canStart = isAdmin || (window !== "closed" && canStartTeam(window, await activePlanSlug(service, user.id)))
      hasCard = await hasCardOnFile(service, user.id)
    }
  }

  const opens = {
    founders: league.founders_opens_at ? instantLabel(league.founders_opens_at) : null,
    members: league.members_opens_at ? instantLabel(league.members_opens_at) : null,
    public: league.public_opens_at ? instantLabel(league.public_opens_at) : null,
    closes: league.signup_closes_on ? dayLabel(league.signup_closes_on, { weekday: "short", month: "short", day: "numeric" }) : null,
  }
  const notOpenMessage =
    window === "closed" ? "Signups for this season have closed."
    : `Signups open to Founders ${opens.founders}, to Eagle and Albatross members ${opens.members}, and to everyone ${opens.public}.`

  const { data: disclosures } = await service.from("disclosures").select("id, title, body").eq("active", true).order("created_at")

  const first = nights[0]
  const last = nights[nights.length - 1]
  const skipped = (league.skip_dates ?? []).map((d) => dayLabel(d, { month: "short", day: "numeric" }))
  const chargeText =
    `I authorize Tee365 to charge my card ${money.format(perWeek)} on each league night, ${weeks} nights from ` +
    `${dayLabel(first, { month: "short", day: "numeric" })} to ${dayLabel(last, { month: "short", day: "numeric" })}` +
    `${skipped.length ? ` (no league ${skipped.join(", ")})` : ""}. Once week one tees off I'm in for the season, missed weeks included.`

  const teeOptions = teeTimes.map((t) => ({
    value: t, label: teeTimeLabel(t), teamsLeft: Math.max(league.teams_per_tee_time - (counts[t] ?? 0), 0),
  }))

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      {!league.active && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Admin preview. Customers can&apos;t see this page until the league is turned on.
        </div>
      )}

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
          Fall {first.slice(0, 4)} &middot; {weeks} weeks &middot; Thursdays
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{league.name}</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-300">
          Two-person scramble, 9 holes, Thursday nights at {teeTimes.map(teeTimeLabel).join(" or ")}.
          Eight weeks, {dayLabel(first, { month: "long", day: "numeric" })} to {dayLabel(last, { month: "long", day: "numeric" })}
          {skipped.length ? `, no league on Thanksgiving` : ""}. Run start to finish by {COMMISSIONER_NAME}, the owner.
        </p>
      </header>

      <section className="rounded-2xl border border-brand/30 bg-brand/5 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">The deal</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight text-white">
          {money.format(perWeek)}<span className="text-lg font-normal text-neutral-400"> / week per player</span>
        </p>
        <p className="mt-2 text-sm text-neutral-300">
          Charged to your card each league night. {money.format(perWeek - potPerWeek)} is your bay time,
          {" "}{money.format(potPerWeek)} goes into the pot, and 100% of the pot is paid out in cash.
        </p>
        <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-neutral-500">Cash pot</dt>
            <dd className="mt-1 font-semibold text-white">{money.format(fullPot)}</dd>
            <dd className="text-xs text-neutral-500">at a full field</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-neutral-500">Format</dt>
            <dd className="mt-1 font-semibold text-white">2-person scramble</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-neutral-500">Teams left</dt>
            <dd className="mt-1 font-semibold text-white">{teamsLeft} of {league.teams_per_tee_time * teeTimes.length}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Prizes</h2>
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-sm">
          {[
            ["Low gross", "50% of the pot, cash"],
            ["Low net", "50% of the pot, cash"],
            ["2nd place net", "A year of Eagle membership each (already a member? 10 free hours each instead)"],
            ["3rd place net", "4 free hours each"],
          ].map(([place, prize]) => (
            <div key={place} className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between">
              <span className="font-semibold text-white">{place}</span>
              <span className="text-neutral-300 sm:text-right">{prize}</span>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5 text-xs leading-relaxed text-neutral-400">
          <li>One cash prize per team. If the same team wins low gross and low net, they take gross and the net prize goes to the next team.</li>
          <li>Prizes go in order: low gross, then 1st, 2nd and 3rd net, skipping a team that already won.</li>
          <li>Ties go to the lower score in the finale. Still tied, the prize is split.</li>
          <li>Cash is paid to each player at the finale. Free hours are good through March 31.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">How it works</h2>
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {[
            ["Two-person scramble", "Both of you hit, pick the better shot, and both play the next one from there. One team score per hole."],
            ["Two teams to a bay", "Four players, two hours, 9 holes. You keep your tee time all season."],
            ["Your best 7 of 8", "Your season is your best seven weeks. Miss a week and that's your drop. No makeup rounds, no blind draws."],
            ["Handicaps that run themselves", "Weeks one and two everyone plays straight. From week three each team gets a handicap from its own scores, 80% of what you average over par, capped at 8 strokes, updated every week. Standings show gross and net."],
            ["Scores on your phone", "Right after your round, one team enters its score and the other team in your bay confirms with a tap. The leaderboard updates that night."],
            ["You'll always know what's happening", "A text the night before with your tee time and bay, and a Friday recap with the week's results and standings."],
          ].map(([title, body]) => (
            <div key={title} className="space-y-1.5 p-5">
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-neutral-300">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Schedule</h2>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <ol className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            {nights.map((d, i) => (
              <li key={d} className="flex flex-col">
                <span className="text-xs uppercase tracking-wider text-neutral-500">{i === nights.length - 1 ? "Finale" : `Week ${i + 1}`}</span>
                <span className="font-medium text-white">{dayLabel(d, { month: "short", day: "numeric" })}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 space-y-1 border-t border-white/10 pt-4 text-xs leading-relaxed text-neutral-400">
            <p>Signups open to Founders {opens.founders}, to Eagle and Albatross members {opens.members}, and to everyone {opens.public}.</p>
            <p>Signups close {opens.closes}.</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Sign up your team</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
          {teamsLeft > 0 ? `${teamsLeft} team spots left` : "Full, waitlist open"}
        </h2>
        <LeagueSignup
          leagueId={league.id}
          signedIn={Boolean(user)}
          canStart={canStart}
          notOpenMessage={notOpenMessage}
          hasCard={hasCard}
          teeTimes={teeOptions}
          myTeam={myTeam}
          chargeText={chargeText}
          disclosures={(disclosures ?? []) as { id: string; title: string; body: string }[]}
        />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Good to know</h2>
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-relaxed text-neutral-300">
          <p><span className="font-semibold text-white">Skill level.</span> All of them. That&apos;s what the handicap is for. Never played a simulator? Week one is a fine place to start.</p>
          <p><span className="font-semibold text-white">Clubs.</span> Bring your own or use our loaners. No rental fee.</p>
          <p><span className="font-semibold text-white">Food and drinks.</span> Bring your own snacks and soft drinks. No glass, and no alcohol at Tee365. Zero tolerance.</p>
          <p><span className="font-semibold text-white">Side games.</span> Players often run their own skins game. Tee365 isn&apos;t involved and doesn&apos;t hold any money for it.</p>
          <p><span className="font-semibold text-white">Your commissioner.</span> {COMMISSIONER_NAME} runs this league personally. Questions, problems or a score that looks wrong:{" "}
            <a href={`tel:${COMMISSIONER_PHONE_TEL}`} className="text-white underline">{COMMISSIONER_PHONE_DISPLAY}</a> or{" "}
            <a href="mailto:info@tee365.org" className="text-white underline">info@tee365.org</a>.
          </p>
        </div>
      </section>
    </main>
  )
}
