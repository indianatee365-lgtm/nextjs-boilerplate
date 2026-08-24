"use client"

import { useState, useTransition } from "react"
import { confirmRoster } from "./actions"

export default function WhoIsUpFlow({ bookingId, token }: { bookingId: string; token?: string }) {
  const [names, setNames] = useState<string[]>([""])
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(playerNames: string[]) {
    setError(null)
    startTransition(async () => {
      try {
        await confirmRoster({ bookingId, token, names: playerNames })
        setDone(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  if (done) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-4">
        <p className="font-semibold text-green-400">You&apos;re all set</p>
        <p className="mt-1 text-sm text-neutral-300">Go hit it.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">Add everyone in your group, or skip if it&apos;s just you.</p>

      {names.map((name, i) => (
        <input
          key={i}
          type="text"
          value={name}
          onChange={(e) => {
            const next = [...names]
            next[i] = e.target.value
            setNames(next)
          }}
          placeholder={`Player ${i + 1} name`}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-neutral-500"
        />
      ))}

      {names.length < 6 && (
        <button
          type="button"
          onClick={() => setNames([...names, ""])}
          className="text-sm text-neutral-400 hover:text-white"
        >
          + Add another player
        </button>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit(names)}
          className="flex-1 rounded-md bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          Save group
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit([])}
          className="flex-1 rounded-md border border-white/10 px-4 py-2 text-neutral-300 disabled:opacity-50"
        >
          Just me
        </button>
      </div>
    </div>
  )
}
