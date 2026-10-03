"use client"

import { Fragment, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updatePricing, revertPricingToStandard } from "./actions"

export interface PricingRule {
  id: string
  season_type: string
  day_type: string
  time_type: string
  price_per_hour: number
  default_price_per_hour: number
  updated_at?: string
}

const SEASON_LABEL: Record<string, string> = { on: "On season", off: "Off season" }
const DAY_LABEL: Record<string, string> = { weekday: "Weekday", weekend: "Weekend" }
const TIME_LABEL: Record<string, string> = { premium: "Premium", non_premium: "Off-peak" }

// Stable display order: on season first because that is where the money is, then
// weekday before weekend, premium before off-peak.
function sortKey(r: PricingRule) {
  return (
    (r.season_type === "on" ? 0 : 1) * 100 +
    (r.day_type === "weekday" ? 0 : 1) * 10 +
    (r.time_type === "premium" ? 0 : 1)
  )
}

export default function PricingEditor({
  rules,
  modifiedCount,
}: {
  rules: PricingRule[]
  modifiedCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  // Form state keyed by row id, seeded from the server values.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(rules.map((r) => [r.id, r.price_per_hour.toFixed(2)])),
  )

  const sorted = useMemo(() => [...rules].sort((a, b) => sortKey(a) - sortKey(b)), [rules])

  const dirty = useMemo(
    () => rules.some((r) => (draft[r.id] ?? "") !== r.price_per_hour.toFixed(2)),
    [rules, draft],
  )

  function handleSave() {
    setNote(null)
    startTransition(async () => {
      try {
        const res = await updatePricing(draft)
        setNote({
          ok: true,
          text:
            res.changed === 0
              ? "Nothing to save, those are already the current rates."
              : `Saved. ${res.changed} rate${res.changed === 1 ? "" : "s"} updated and live now.`,
        })
        router.refresh()
      } catch (err) {
        setNote({ ok: false, text: err instanceof Error ? err.message : "Could not save" })
      }
    })
  }

  function handleRevert() {
    if (
      !confirm(
        "Put every rate back to the standard table?\n\nThis replaces all eight rates with the " +
          "original values and takes effect on the next quote.",
      )
    )
      return
    setNote(null)
    startTransition(async () => {
      try {
        const res = await revertPricingToStandard()
        setNote({
          ok: true,
          text:
            res.changed === 0
              ? "Already on the standard table, nothing changed."
              : `Reverted ${res.changed} rate${res.changed === 1 ? "" : "s"} to standard.`,
        })
        // Drop local edits so the inputs show what the server now holds.
        setDraft(Object.fromEntries(rules.map((r) => [r.id, r.default_price_per_hour.toFixed(2)])))
        router.refresh()
      } catch (err) {
        setNote({ ok: false, text: err instanceof Error ? err.message : "Could not revert" })
      }
    })
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-white">Rate table</h2>
        {modifiedCount > 0 ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
            {modifiedCount} off standard
          </span>
        ) : (
          <span className="text-xs text-neutral-500">Matching standard</span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Rate per hour</th>
              <th className="px-4 py-3">Standard</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              // Derived from position rather than a running variable: mutating
              // state during render is both a lint error and genuinely unsafe
              // across re-renders.
              const showSeason = idx === 0 || sorted[idx - 1].season_type !== r.season_type
              const off = r.price_per_hour !== r.default_price_per_hour
              return (
                <Fragment key={r.id}>
                  {showSeason && (
                    <tr className="bg-white/5">
                      <td
                        colSpan={4}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-widest text-neutral-400"
                      >
                        {SEASON_LABEL[r.season_type] ?? r.season_type}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-white/5 text-neutral-300">
                    <td className="px-4 py-3">{DAY_LABEL[r.day_type] ?? r.day_type}</td>
                    <td className="px-4 py-3">{TIME_LABEL[r.time_type] ?? r.time_type}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-neutral-500">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft[r.id] ?? ""}
                          onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
                          disabled={isPending}
                          className={`w-24 rounded-lg border bg-black/30 px-2 py-1.5 text-white disabled:opacity-50 ${
                            off ? "border-amber-500/40" : "border-white/10"
                          }`}
                        />
                        {off && <span className="text-xs text-amber-400">changed</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      ${r.default_price_per_hour.toFixed(2)}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="rounded-lg border border-brand/40 bg-brand/15 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand/25 disabled:opacity-40"
        >
          {isPending ? "Saving..." : dirty ? "Save new rates" : "No changes to save"}
        </button>
        <button
          onClick={handleRevert}
          disabled={isPending || modifiedCount === 0}
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition hover:border-white/20 hover:text-white disabled:opacity-40"
        >
          Revert to standard table
        </button>
      </div>

      {note && (
        <p className={`mt-3 text-sm ${note.ok ? "text-green-400" : "text-red-400"}`}>{note.text}</p>
      )}

      <p className="mt-3 text-xs text-neutral-600">
        Every change is written to the system log with the old and new value, so a past booking
        price can always be explained.
      </p>
    </section>
  )
}
