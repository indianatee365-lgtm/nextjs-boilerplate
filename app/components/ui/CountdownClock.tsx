"use client"

import { useSyncExternalStore } from "react"

interface Remaining {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
}

function getRemaining(deadline: number): Remaining {
  const diff = Math.max(0, deadline - Date.now())
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    expired: diff <= 0,
  }
}

const pad = (n: number) => String(n).padStart(2, "0")

function subscribe(callback: () => void) {
  const id = setInterval(callback, 1000)
  return () => clearInterval(id)
}

// null on the server and on the very first client render, before hydration
// - avoids a mismatch since the countdown value depends on Date.now().
function getServerSnapshot() {
  return null
}

export function CountdownClock({ deadline, className }: { deadline: string; className?: string }) {
  const target = new Date(deadline).getTime()
  const nowMs = useSyncExternalStore(subscribe, () => Date.now(), getServerSnapshot)

  if (nowMs === null) return null

  const remaining = getRemaining(target)
  if (remaining.expired) return null

  return (
    <div className={className} aria-live="polite">
      {remaining.days}d {pad(remaining.hours)}h {pad(remaining.minutes)}m {pad(remaining.seconds)}s
    </div>
  )
}
