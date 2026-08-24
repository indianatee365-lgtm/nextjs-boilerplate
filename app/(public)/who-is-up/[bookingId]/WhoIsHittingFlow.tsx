"use client"

import { useState, useTransition } from "react"
import { setCurrentHitter } from "./actions"

export default function WhoIsHittingFlow({
  bookingId,
  token,
  names,
  initialHitter,
}: {
  bookingId: string
  token?: string
  names: string[]
  initialHitter: string | null
}) {
  const [current, setCurrent] = useState(initialHitter)
  const [isPending, startTransition] = useTransition()

  function pick(name: string) {
    setCurrent(name)
    startTransition(async () => {
      await setCurrentHitter({ bookingId, token, name })
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400">Tap whoever&apos;s up next - switch anytime.</p>
      <div className="grid grid-cols-2 gap-2">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            disabled={isPending}
            onClick={() => pick(name)}
            className={`rounded-md border px-4 py-3 font-semibold disabled:opacity-50 ${
              current === name
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/5 text-neutral-300"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
