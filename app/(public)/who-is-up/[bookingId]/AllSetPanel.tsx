"use client"

import { useState } from "react"
import AddPlayerForm from "./AddPlayerForm"

// A solo "Just me" booking has roster_confirmed_at set but no roster_names,
// so it never rendered WhoIsHittingFlow's own "+ Add someone" toggle -
// added 2026-09-01 so a solo booker who decides mid-round to bring someone
// in has a way back too, not just a group booking adding a second player.
export default function AllSetPanel({ bookingId, token }: { bookingId: string; token?: string }) {
  const [adding, setAdding] = useState(false)

  if (adding) {
    return <AddPlayerForm bookingId={bookingId} token={token} onCancel={() => setAdding(false)} />
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
        <p className="font-semibold text-green-400">You&apos;re all set</p>
        <p className="mt-1 text-sm text-neutral-300">Go hit it.</p>
      </div>
      <button type="button" onClick={() => setAdding(true)} className="text-sm text-neutral-400 hover:text-white">
        + Someone joining you?
      </button>
    </div>
  )
}
