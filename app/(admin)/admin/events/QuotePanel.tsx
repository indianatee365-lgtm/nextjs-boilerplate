"use client"

import { useEffect, useState } from "react"
import { quoteAction } from "./actions"
import type { Quote } from "@/lib/events/quote"

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`

/**
 * Live list-price quote from the form's date, start, hours and bays. With no
 * bays ticked yet, a bay count can be chosen here to quote before deciding
 * which bays.
 */
export default function QuotePanel({ date, startTime, hours, bayCount, onUse }: { date: string; startTime: string; hours: string; bayCount: number; onUse: (total: number) => void }) {
  const [fallbackBays, setFallbackBays] = useState(1)
  const bays = bayCount || fallbackBays
  const [quote, setQuote] = useState<Quote | null>(null)
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(startTime) && Number(hours) > 0

  useEffect(() => {
    if (!ready) return
    let live = true
    const [h, m] = startTime.split(":").map(Number)
    quoteAction(date, h * 60 + m, Math.round(Number(hours) * 60), bays).then((q) => { if (live) setQuote(q) }).catch(() => { if (live) setQuote(null) })
    return () => { live = false }
  }, [ready, date, startTime, hours, bays])

  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-white">Quote calculator (list price)</p>
        {!bayCount && (
          <label className="flex items-center gap-1 text-xs text-neutral-400">
            Bays
            <select value={fallbackBays} onChange={(e) => setFallbackBays(Number(e.target.value))} className="rounded border border-white/15 bg-black/30 px-1 py-0.5 text-white" aria-label="Number of bays to quote">
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      {!ready || !quote ? (
        <p className="mt-1 text-xs text-neutral-400">Pick a date, start time and hours above to see the base price.</p>
      ) : (
        <>
          <table className="mt-2 w-full text-xs">
            <tbody>
              {quote.lines.map((l, i) => (
                <tr key={i} className="text-neutral-300">
                  <td className="py-0.5 pr-2">{l.from} to {l.to}</td>
                  <td className="py-0.5 pr-2 text-neutral-400">{l.label}</td>
                  <td className="py-0.5 pr-2">{money(l.rate)}/hr &times; {l.hours}h &times; {l.bays} bay{l.bays > 1 ? "s" : ""}</td>
                  <td className="py-0.5 text-right">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
            <p className="text-white">Base: <span className="text-lg font-semibold">{money(quote.total)}</span> <span className="text-xs text-neutral-400">({money(quote.perBay)} per bay, {quote.hours}h)</span></p>
            <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => onUse(quote.total)}>Use as total</button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Each half hour at its own rate (premium starts 4pm). Before member or veteran discounts.</p>
        </>
      )}
    </div>
  )
}
