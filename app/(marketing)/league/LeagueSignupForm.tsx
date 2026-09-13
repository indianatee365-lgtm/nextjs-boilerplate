"use client"

import { useState } from "react"

const SLOTS = [
  { value: "17:30", label: "5:30pm" },
  { value: "19:30", label: "7:30pm" },
  { value: "either", label: "Either works" },
]

type Props = {
  leagueId: string
  signedIn: boolean
  alreadyIn: boolean
  full: boolean
}

export default function LeagueSignupForm({ leagueId, signedIn, alreadyIn, full }: Props) {
  const [partnerName, setPartnerName] = useState("")
  const [slot, setSlot] = useState("either")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  if (alreadyIn) {
    return (
      <p className="mt-4 text-sm text-[#00A651]">
        You are on the roster. We will text you the pairings and your course before week one.
      </p>
    )
  }

  if (!signedIn) {
    return (
      <div className="mt-4 space-y-3">
        <p className="text-sm leading-relaxed text-neutral-300">
          Sign in to claim a spot. We bill the weekly fee to the card on your account, so you need
          one either way. It takes about thirty seconds if you do not have one yet.
        </p>
        <a
          href="/login?next=/league"
          className="inline-block rounded-xl bg-[#00A651] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#00A651]/85"
        >
          Sign in and claim a spot
        </a>
      </div>
    )
  }

  if (status === "success") {
    return (
      <p className="mt-4 text-sm text-[#00A651]">
        You are in. Check your email for the rules sheet, and we will text pairings the weekend
        before week one.
      </p>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    setMessage("")
    try {
      const res = await fetch("/api/leagues/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          partnerName: partnerName.trim() || null,
          preferredSlot: slot === "either" ? null : slot,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setStatus("success")
      } else {
        setStatus("error")
        setMessage(body.error ?? "Something went wrong. Please try again.")
      }
    } catch {
      setStatus("error")
      setMessage("Something went wrong. Please try again.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-5">
      <div>
        <label htmlFor="partner-name" className="block text-xs uppercase tracking-wider text-neutral-500">
          Your partner
        </label>
        <input
          id="partner-name"
          type="text"
          placeholder="Leave blank and we will pair you up"
          value={partnerName}
          onChange={(e) => setPartnerName(e.target.value)}
          className="mt-2 w-full rounded-xl border-2 border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-white/30"
        />
      </div>

      <fieldset>
        <legend className="text-xs uppercase tracking-wider text-neutral-500">Tee time</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SLOTS.map(({ value, label }) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border-2 px-4 py-2 text-sm transition ${
                slot === value
                  ? "border-[#00A651]/60 bg-[#00A651]/10 text-white"
                  : "border-white/10 bg-black/20 text-neutral-300 hover:border-white/30"
              }`}
            >
              <input
                type="radio"
                name="slot"
                value={value}
                checked={slot === value}
                onChange={() => setSlot(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={status === "loading" || full}
        className="rounded-xl bg-[#00A651] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#00A651]/85 disabled:opacity-50"
      >
        {full ? "Join the waitlist" : status === "loading" ? "Claiming…" : "Claim my spot"}
      </button>

      <p className="text-xs leading-relaxed text-neutral-500">
        No charge today. Weekly billing starts the Monday before week one.
      </p>

      {status === "error" && <p className="text-xs text-red-400">{message}</p>}
    </form>
  )
}
