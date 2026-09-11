"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setBayOverride, requestBayRestart, startTestBooking } from "./actions"
import ExtendBookingButton from "./ExtendBookingButton"

export type OverrideState = "occupied" | "available" | "maintenance" | null

export type BayCardData = {
  bayId: string
  name: string
  online: boolean
  heartbeatAgo: string | null
  /** What the agent reports it is ACTUALLY doing. Ground truth. */
  actual: string | null
  /** What an admin has forced from this page. A request, not a fact. */
  override: OverrideState
  simRunning: boolean | null
  lastCrashRestartAt: string | null
  recentKills: string[]
  enforcementMode: string | null
}

const STATE_LABEL: Record<string, string> = {
  occupied: "In session",
  available: "Available",
  maintenance: "Maintenance",
}

// Semantic, and deliberately not the brand accent: these encode condition, not
// identity. Maintenance is amber rather than red because it is a deliberate
// state, not a fault.
const STATE_TONE: Record<string, string> = {
  occupied: "text-green-400",
  available: "text-neutral-200",
  maintenance: "text-amber-400",
}

const CHOICES: { value: OverrideState; label: string; hint: string }[] = [
  { value: null, label: "Follow bookings", hint: "Normal. The schedule decides." },
  { value: "occupied", label: "Force on", hint: "Sim runs regardless of bookings." },
  { value: "available", label: "Force off", hint: "Idle regardless of bookings." },
  { value: "maintenance", label: "Maintenance", hint: "Suspends kiosk lockdown." },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      {children}
    </div>
  )
}

export default function BayCard({ data }: { data: BayCardData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyChoice, setBusyChoice] = useState<OverrideState | "restart" | "test" | null>(null)
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  // Maintenance that this page did not ask for can only have come from the bay
  // PC itself, where ctrl+shift+m writes a local maintenance.flag file. The
  // agent computes maintenance as (local flag OR this override), so clearing
  // the override genuinely cannot help here. Surfacing that is the whole point:
  // on 2026-09-11 the override was cleared correctly, the bay stayed in
  // maintenance because of the local flag, and nothing on this page said so.
  const localMaintenance = data.actual === "maintenance" && data.override !== "maintenance"

  // The agent has not caught up with the override yet, or something on the bay
  // is overriding it. Either way the two disagree and the page should say so
  // rather than quietly showing one of them.
  const overrideNotApplied =
    data.override !== null && data.actual !== null && data.actual !== data.override

  const simTrouble = data.online && data.actual === "occupied" && data.simRunning === false

  function act(
    key: OverrideState | "restart" | "test",
    fn: () => Promise<unknown>,
    okText: string,
  ) {
    setFlash(null)
    setBusyChoice(key)
    startTransition(async () => {
      try {
        await fn()
        setFlash({ kind: "ok", text: okText })
        router.refresh()
      } catch (err) {
        setFlash({ kind: "err", text: err instanceof Error ? err.message : "That didn't work" })
      }
      setBusyChoice(null)
      setTimeout(() => setFlash(null), 6000)
    })
  }

  const actualLabel = data.actual ? STATE_LABEL[data.actual] ?? data.actual : "No status yet"
  const actualTone = data.actual ? STATE_TONE[data.actual] ?? "text-neutral-200" : "text-neutral-500"

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-5">
      {/* Identity and liveness */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">{data.name}</p>
          <p className={`mt-0.5 text-2xl font-semibold tracking-tight ${actualTone}`}>{actualLabel}</p>
        </div>
        <div className="text-right">
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
              data.online ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            {data.online ? "Agent online" : "Agent offline"}
          </span>
          {data.heartbeatAgo && (
            <p className="mt-1 text-[11px] tabular-nums text-neutral-600">{data.heartbeatAgo}</p>
          )}
        </div>
      </div>

      {/* Why it is in this state, whenever that is not simply "the schedule". */}
      {(localMaintenance || data.override !== null || overrideNotApplied) && (
        <div className="space-y-2">
          {localMaintenance && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-300">Switched on at the bay, not from here</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
                Someone pressed ctrl+shift+m on the bay PC, which writes a local maintenance file.
                The buttons below cannot clear it, because the agent treats maintenance as
                {" "}<span className="font-medium">local file OR override</span>. Press ctrl+shift+m
                again at the bay, or run &ldquo;Disable Maintenance Mode.bat&rdquo; there.
              </p>
            </div>
          )}
          {data.override !== null && !localMaintenance && (
            <p className="text-xs text-neutral-400">
              Forced to <span className="font-medium text-neutral-200">{STATE_LABEL[data.override] ?? data.override}</span> from this page.
              Bookings are being ignored until you set it back to Follow bookings.
            </p>
          )}
          {overrideNotApplied && !localMaintenance && (
            <p className="text-xs text-amber-400">
              You asked for {STATE_LABEL[data.override!] ?? data.override}, the bay still reports {actualLabel}.
              Give it a poll cycle, about 15 seconds.
            </p>
          )}
        </div>
      )}

      {simTrouble && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-300">
          Should be running for an active session but the sim is not reporting as running.
        </p>
      )}

      {/* Control. A segmented picker rather than loose buttons, so the state you
          are in is visible without clicking anything. */}
      <Field label="Bay control">
        <div className="grid grid-cols-2 gap-1.5">
          {CHOICES.map((c) => {
            const selected = data.override === c.value
            const busy = busyChoice === c.value && isPending
            return (
              <button
                key={String(c.label)}
                type="button"
                title={c.hint}
                disabled={isPending}
                onClick={() =>
                  act(c.value, () => setBayOverride(data.bayId, c.value),
                      c.value === null ? "Back to following bookings" : `Forced to ${c.label}`)
                }
                className={`rounded-lg border px-3 py-2 text-left text-xs transition disabled:opacity-60 ${
                  selected
                    ? "border-[color:var(--brand)] bg-[color:var(--brand)]/15 text-white"
                    : "border-white/10 bg-black/20 text-neutral-300 hover:border-white/30"
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  {busy && (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-500 border-t-transparent" />
                  )}
                  {selected && !busy && <span aria-hidden="true">&#10003;</span>}
                  {c.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{c.hint}</span>
              </button>
            )
          })}
        </div>
      </Field>

      <Field label="Actions">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => act("restart", () => requestBayRestart(data.bayId), "Restart requested")}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/30 disabled:opacity-60"
          >
            {busyChoice === "restart" && isPending ? "Requesting…" : "Restart simulator"}
          </button>
          <ExtendBookingButton bayId={data.bayId} />
        </div>
      </Field>

      {flash && (
        <p className={`text-xs font-medium ${flash.kind === "ok" ? "text-green-400" : "text-red-400"}`}>
          {flash.kind === "ok" ? "✓ " : ""}{flash.text}
        </p>
      )}

      {/* Diagnostics, kept quiet - useful when something is wrong, noise otherwise. */}
      {(data.lastCrashRestartAt || data.recentKills.length > 0 || data.enforcementMode) && (
        <div className="space-y-0.5 border-t border-white/10 pt-3 text-[11px] text-neutral-600">
          {data.enforcementMode && <p>Enforcement: {data.enforcementMode}</p>}
          {data.lastCrashRestartAt && <p>Last crash-restart: {data.lastCrashRestartAt}</p>}
          {data.recentKills.length > 0 && <p>Recently blocked: {data.recentKills.join(", ")}</p>}
        </div>
      )}

      <form
        action={(fd) => act("test", () => startTestBooking(fd), "Test booking started")}
        className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3"
      >
        <input type="hidden" name="bayId" value={data.bayId} />
        <select
          name="durationMinutes"
          defaultValue="15"
          className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-neutral-300"
        >
          <option value="15">15 min</option>
          <option value="30">30 min</option>
          <option value="60">1 hour</option>
        </select>
        <input
          type="email"
          name="customerEmail"
          placeholder="Customer email (blank = you)"
          className="w-44 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-neutral-300 placeholder:text-neutral-600"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 transition hover:border-white/30 disabled:opacity-60"
        >
          {busyChoice === "test" && isPending ? "Starting…" : "Start test booking"}
        </button>
      </form>
    </div>
  )
}
