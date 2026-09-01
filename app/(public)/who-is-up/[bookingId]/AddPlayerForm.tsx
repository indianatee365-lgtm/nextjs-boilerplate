"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addPlayer } from "./actions"

export default function AddPlayerForm({
  bookingId,
  token,
  onCancel,
}: {
  bookingId: string
  token?: string
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notFoundEmail, setNotFoundEmail] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await addPlayer({ bookingId, token, name, email })
        if (result.notFoundEmail) {
          setNotFoundEmail(true)
        } else {
          router.refresh()
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Their name"
        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-neutral-500"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Their Tee365 email (optional) - links their own account"
        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
      />
      {notFoundEmail && (
        <p className="text-sm text-yellow-400">
          No Tee365 account found for that email. Double-check it, or continue - their shots will save under your
          account instead.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={submit}
          className="flex-1 rounded-md bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
        >
          Add to group
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onCancel}
          className="flex-1 rounded-md border border-white/10 px-4 py-2 text-neutral-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
