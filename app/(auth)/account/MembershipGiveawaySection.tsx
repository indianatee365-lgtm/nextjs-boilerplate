"use client"

import { useState, useTransition } from "react"
import { redeemMembershipGiveawayCode } from "./membership-giveaway-actions"

export default function MembershipGiveawaySection() {
  const [code, setCode] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRedeem() {
    if (!code.trim() || pending) return
    startTransition(async () => {
      const result = await redeemMembershipGiveawayCode(code)
      setMessage({ ok: result.ok, text: result.message })
      if (result.ok) setCode("")
    })
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-sm font-semibold text-white">Have a membership code?</p>
      <p className="text-xs text-neutral-400 mt-0.5">
        Redeem a free-membership code here. Your discount and perks apply right away, no charge today.
      </p>
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
