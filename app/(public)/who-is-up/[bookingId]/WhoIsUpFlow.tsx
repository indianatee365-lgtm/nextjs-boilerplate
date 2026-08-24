"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { confirmRoster } from "./actions"

type PlayerInput = { name: string; email: string }

export default function WhoIsUpFlow({
  bookingId,
  token,
  bookerName,
  bayName,
}: {
  bookingId: string
  token?: string
  bookerName: string
  bayName: string
}) {
  const [players, setPlayers] = useState<PlayerInput[]>([{ name: bookerName, email: "" }])
  const [error, setError] = useState<string | null>(null)
  const [notFoundEmails, setNotFoundEmails] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function updatePlayer(i: number, field: keyof PlayerInput, value: string) {
    const next = [...players]
    next[i] = { ...next[i], [field]: value }
    setPlayers(next)
  }

  function submit(list: PlayerInput[]) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await confirmRoster({ bookingId, token, players: list })
        if (result.notFoundEmails.length > 0) {
          setNotFoundEmails(result.notFoundEmails)
        } else {
          router.refresh()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Welcome to Tee365, {bookerName}!</h1>
      <p className="text-sm text-neutral-400">
        {bayName}
        {bayName ? " · " : ""}Are you playing with anyone else?
      </p>

      <div className="space-y-3">
        {players.map((p, i) => (
          <div key={i} className="space-y-1">
            <input
              type="text"
              value={p.name}
              onChange={(e) => updatePlayer(i, "name", e.target.value)}
              placeholder={i === 0 ? "Your name" : `Player ${i + 1} name`}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-neutral-500"
            />
            {i > 0 && (
              <input
                type="email"
                value={p.email}
                onChange={(e) => updatePlayer(i, "email", e.target.value)}
                placeholder="Their Tee365 email (optional) - links their own account"
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
              />
            )}
          </div>
        ))}
      </div>

      {players.length < 6 && (
        <button
          type="button"
          onClick={() => setPlayers([...players, { name: "", email: "" }])}
          className="text-sm text-neutral-400 hover:text-white"
        >
          + Add another player
        </button>
      )}

      {notFoundEmails.length > 0 && (
        <div className="space-y-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-3">
          <p className="text-sm text-yellow-400">
            No Tee365 account found for: {notFoundEmails.join(", ")}. Double-check the email, or continue - they&apos;ll
            still show up in the group with shots saved under your account instead.
          </p>
          <button type="button" onClick={() => router.refresh()} className="text-sm text-white underline">
            Continue anyway
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit(players)}
          className="flex-1 rounded-md bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          Save group
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit([{ name: bookerName, email: "" }])}
          className="flex-1 rounded-md border border-white/10 px-4 py-2 text-neutral-300 disabled:opacity-50"
        >
          Just me
        </button>
      </div>
    </div>
  )
}
