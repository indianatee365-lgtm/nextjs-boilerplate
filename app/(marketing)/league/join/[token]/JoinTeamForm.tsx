"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import AddCardInline from "@/app/components/payments/AddCardInline"
import HandicapFields, { handicapAnswerValid, type HandicapAnswer } from "@/app/(marketing)/league/HandicapFields"

export default function JoinTeamForm({
  token,
  hasCard,
  chargeText,
  disclosures,
}: {
  token: string
  hasCard: boolean
  chargeText: string
  disclosures: { id: string; title: string; body: string }[]
}) {
  const router = useRouter()
  const [cardSaved, setCardSaved] = useState(hasCard)
  const [agreedToWaiver, setAgreedToWaiver] = useState(false)
  const [authorizedCharges, setAuthorizedCharges] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [handicap, setHandicap] = useState<HandicapAnswer>({ basis: "index", value: "", forwardTees: false })

  async function accept() {
    if (submitting) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/leagues/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreedToWaiver, authorizedCharges,
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

  return (
    <div className="space-y-5">
      <HandicapFields value={handicap} onChange={setHandicap} />
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm font-semibold text-white">Card for the weekly fee</p>
        {cardSaved ? (
          <p className="mt-1 text-sm text-brand">Card on file. You&apos;re set.</p>
        ) : (
          <div className="mt-3"><AddCardInline onSaved={() => setCardSaved(true)} /></div>
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
          <input type="checkbox" checked={agreedToWaiver} onChange={(e) => setAgreedToWaiver(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
          I&apos;ve read and agree to the {disclosures.map((d) => d.title).join(", ")}.
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-300">
          <input type="checkbox" checked={authorizedCharges} onChange={(e) => setAuthorizedCharges(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
          {chargeText}
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" onClick={accept} disabled={!handicapAnswerValid(handicap) || !cardSaved || !agreedToWaiver || !authorizedCharges || submitting} className="btn-primary w-full py-3">
        {submitting ? "Joining..." : "Accept and join the team"}
      </button>
    </div>
  )
}
