"use client"

import { useState, useTransition } from "react"
import { claimPurchasedPack, redeemHourCreditCode } from "./hour-credit-actions"

export default function HourCreditsSection({
  availableHours,
  nextExpiry,
  unclaimedPacks = [],
}: {
  availableHours: number
  nextExpiry: string | null
  unclaimedPacks?: Array<{ id: string; hours: number; code: string | null }>
}) {
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRedeem() {
    if (!code.trim() || pending) return
    startTransition(async () => {
      const result = await redeemHourCreditCode(code)
      setMessage({ ok: result.ok, text: result.message })
      if (result.ok) setCode("")
    })
  }

  function handleClaim(id: string) {
    if (pending) return
    startTransition(async () => {
      const result = await claimPurchasedPack(id)
      setMessage({ ok: result.ok, text: result.message })
    })
  }

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
      {unclaimedPacks.map((p) => (
        <div key={p.id} className="mb-4 rounded-lg border border-brand/30 bg-brand/10 px-3 py-3">
          <p className="text-sm text-white">
            You have a {p.hours}-hour pack{p.code ? <> (code <span className="font-mono">{p.code}</span>)</> : null} from your purchase. Add it to your account?
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Buying it for someone else? Skip this and send them the code from your email.
          </p>
          <button
            onClick={() => handleClaim(p.id)}
            disabled={pending}
            className="btn-primary mt-3 px-4 py-2 text-xs"
          >
            {pending ? "Adding..." : `Add ${p.hours} hours to my account`}
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">Free hours</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            {availableHours > 0
              ? `${availableHours} hr${availableHours !== 1 ? "s" : ""} available, applied automatically when you book`
              : "Have a code from a raffle or giveaway? Redeem it here."}
          </p>
        </div>
        {availableHours > 0 && (
          <span className="rounded-full bg-brand/20 px-3 py-1 text-sm font-bold text-brand">
            {availableHours} hr{availableHours !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {availableHours > 0 && nextExpiry && (
        <p className="mt-2 text-xs text-neutral-500">
          Use by {new Date(new Date(nextExpiry).getTime() - 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code"
          className="input flex-1"
          disabled={pending}
        />
        <button
          onClick={handleRedeem}
          disabled={pending || !code.trim()}
          className="btn-secondary px-4 text-sm"
        >
          {pending ? "Redeeming…" : "Redeem"}
        </button>
      </div>
      {message && (
        <p className={`mt-2 text-xs ${message.ok ? "text-green-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
