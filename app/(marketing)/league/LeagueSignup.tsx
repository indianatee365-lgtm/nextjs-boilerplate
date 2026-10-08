"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import AddCardInline from "@/app/components/payments/AddCardInline"
import HandicapFields, { handicapAnswerValid, type HandicapAnswer } from "@/app/(marketing)/league/HandicapFields"

export interface MyTeam {
  name: string
  role: "captain" | "partner"
  teeTime: string
  status: "pending_partner" | "confirmed" | "waitlisted" | "withdrawn"
  captainName: string
  partnerName: string
  inviteLink: string | null
}

interface TeeTimeOption { value: string; label: string; teamsLeft: number }
interface Disclosure { id: string; title: string; body: string }

export default function LeagueSignup({
  leagueId,
  signedIn,
  canStart,
  notOpenMessage,
  hasCard,
  teeTimes,
  myTeam,
  chargeText,
  disclosures,
}: {
  leagueId: string
  signedIn: boolean
  canStart: boolean
  notOpenMessage: string | null
  hasCard: boolean
  teeTimes: TeeTimeOption[]
  myTeam: MyTeam | null
  chargeText: string
  disclosures: Disclosure[]
}) {
  const router = useRouter()
  const [teamName, setTeamName] = useState("")
  const [teeTime, setTeeTime] = useState("either")
  const [partnerName, setPartnerName] = useState("")
  const [partnerEmail, setPartnerEmail] = useState("")
  const [cardSaved, setCardSaved] = useState(hasCard)
  const [agreedToWaiver, setAgreedToWaiver] = useState(false)
  const [authorizedCharges, setAuthorizedCharges] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [handicap, setHandicap] = useState<HandicapAnswer>({ basis: "index", value: "", forwardTees: false })

  if (myTeam) return <TeamCard team={myTeam} copied={copied} onCopy={() => setCopied(true)} />

  if (!signedIn) {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-sm leading-relaxed text-neutral-300">
          Sign in to sign up a team. Both players need a Tee365 account and a card on file for the weekly fee.
        </p>
        <a href="/login?return=/league" className="btn-primary inline-flex px-5 py-2.5">Sign in to sign up</a>
      </div>
    )
  }

  if (!canStart) {
    return <p className="mt-4 text-sm leading-relaxed text-neutral-300">{notOpenMessage}</p>
  }

  const allFull = teeTimes.every((t) => t.teamsLeft <= 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/leagues/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId, teamName, teeTime, partnerName, partnerEmail, agreedToWaiver, authorizedCharges,
          handicapBasis: handicap.basis, handicapValue: handicap.value, forwardTees: handicap.forwardTees,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.")
        setSubmitting(false)
        return
      }
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  const ready = teamName.trim() && partnerName.trim() && handicapAnswerValid(handicap) && cardSaved && agreedToWaiver && authorizedCharges

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      {allFull && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Both tee times are full. You can still sign up and we&apos;ll put your team on the waitlist.
        </p>
      )}

      <div>
        <label htmlFor="team-name" className="label">Team name</label>
        <input id="team-name" className="input" maxLength={40} value={teamName}
          onChange={(e) => setTeamName(e.target.value)} placeholder="Make it a good one" />
      </div>

      <fieldset>
        <legend className="label">Tee time, all season</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {[...teeTimes.map((t) => ({ value: t.value, label: t.label, sub: t.teamsLeft > 0 ? `${t.teamsLeft} teams left` : "Waitlist" })),
            { value: "either", label: "Either", sub: "We'll pick" }].map((o) => (
            <label key={o.value}
              className={`flex min-h-[56px] cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition ${
                teeTime === o.value ? "border-brand bg-brand/10" : "border-white/10 hover:border-white/30"}`}>
              <input type="radio" name="tee-time" value={o.value} checked={teeTime === o.value}
                onChange={() => setTeeTime(o.value)} className="sr-only" />
              <span className="text-sm font-semibold text-white">{o.label}</span>
              <span className="text-xs text-neutral-400">{o.sub}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="partner-name" className="label">Partner&apos;s name</label>
          <input id="partner-name" className="input" maxLength={60} value={partnerName}
            onChange={(e) => setPartnerName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="partner-email" className="label">Partner&apos;s email (optional)</label>
          <input id="partner-email" type="email" className="input" maxLength={120} value={partnerEmail}
            onChange={(e) => setPartnerEmail(e.target.value)} placeholder="We'll email them the invite" />
        </div>
      </div>
      <p className="-mt-2 text-xs text-neutral-500">
        Next you&apos;ll get a link to text your partner. Your team is confirmed when they accept.
      </p>

      <HandicapFields value={handicap} onChange={setHandicap} />

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-white">Card for the weekly fee</p>
        {cardSaved ? (
          <p className="mt-1 text-sm text-brand">Card on file. You&apos;re set.</p>
        ) : (
          <div className="mt-3">
            <AddCardInline onSaved={() => setCardSaved(true)} />
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
        {disclosures.map((d) => (
          <details key={d.id} className="text-sm">
            <summary className="cursor-pointer text-neutral-300 hover:text-white">Read the {d.title}</summary>
            <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-neutral-400">{d.body}</div>
          </details>
        ))}
        <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-300">
          <input type="checkbox" checked={agreedToWaiver} onChange={(e) => setAgreedToWaiver(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand" />
          I&apos;ve read and agree to the {disclosures.map((d) => d.title).join(", ")}.
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-300">
          <input type="checkbox" checked={authorizedCharges} onChange={(e) => setAuthorizedCharges(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand" />
          {chargeText}
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={!ready || submitting} className="btn-primary w-full py-3">
        {submitting ? "Signing up..." : "Sign up our team"}
      </button>
    </form>
  )
}

function TeamCard({ team, copied, onCopy }: { team: MyTeam; copied: boolean; onCopy: () => void }) {
  const statusLine =
    team.status === "confirmed" ? `Confirmed for the ${team.teeTime} tee time.`
    : team.status === "waitlisted" ? "On the waitlist. We'll text you the moment a spot opens."
    : `Holding a spot at ${team.teeTime}. Waiting on ${team.partnerName} to accept.`
  const smsBody = team.inviteLink
    ? `I signed us up for the Tee365 Thursday Night League as team "${team.name}". Accept here so we're confirmed: ${team.inviteLink}`
    : ""

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-brand/30 bg-brand/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Your team</p>
        <p className="mt-1 text-lg font-semibold text-white">{team.name}</p>
        <p className="mt-1 text-sm text-neutral-300">{team.captainName} and {team.partnerName}</p>
        <p className="mt-2 text-sm text-neutral-300">{statusLine}</p>
      </div>
      {team.role === "captain" && team.status === "pending_partner" && team.inviteLink && (
        <div className="space-y-2">
          <a href={`sms:?&body=${encodeURIComponent(smsBody)}`} className="btn-primary flex w-full py-3">
            Text your partner the invite
          </a>
          <button type="button" className="btn-secondary w-full py-3"
            onClick={() => { navigator.clipboard?.writeText(team.inviteLink!).then(onCopy).catch(() => {}) }}>
            {copied ? "Link copied" : "Copy invite link"}
          </button>
        </div>
      )}
    </div>
  )
}
