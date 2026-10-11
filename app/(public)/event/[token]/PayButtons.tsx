"use client"

import { useState } from "react"

const money = (n: number) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`

export default function PayButtons({ token, options }: { token: string; options: { kind: "deposit" | "balance" | "full"; amount: number }[] }) {
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")

  async function pay(kind: string) {
    setBusy(kind)
    setError("")
    try {
      const res = await fetch(`/api/events/${token}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) { setError(data.error ?? "Something went wrong. Try again."); setBusy(""); return }
      window.location.assign(data.url)
    } catch {
      setError("Something went wrong. Check your connection and try again.")
      setBusy("")
    }
  }

  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <button key={o.kind} onClick={() => pay(o.kind)} disabled={Boolean(busy)}
          className={`${i === 0 ? "btn-primary" : "btn-secondary"} w-full py-3`}>
          {busy === o.kind ? "Opening secure checkout..." : o.kind === "deposit" ? `Pay the ${money(o.amount)} deposit` : o.kind === "balance" ? `Pay the ${money(o.amount)} balance` : `Pay ${money(o.amount)} in full`}
        </button>
      ))}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
