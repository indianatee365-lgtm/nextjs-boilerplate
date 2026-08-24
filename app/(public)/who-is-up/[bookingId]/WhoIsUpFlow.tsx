"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { confirmRoster } from "./actions"

export default function WhoIsUpFlow({ bookingId, token }: { bookingId: string; token?: string }) {
  const [names, setNames] = useState<string[]>([""])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit(playerNames: string[]) {
    setError(null)
    startTransition(async () => {
      try {
        await confirmRoster({ bookingId, token, names: playerNames })
        // Re-fetches the server component so it picks up roster_confirmed_at
        // and switches straight to the "who's hitting" selector (or the solo
        // message) without a full page reload.
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
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
