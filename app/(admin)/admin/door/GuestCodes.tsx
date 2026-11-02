"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createGuestCodeAction, revokeGuestCodeAction } from "./actions"
import type { GuestCode } from "@/lib/access-control/guest-codes"

function dayLabel(startsAt: string) {
  return new Date(startsAt).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "America/Indiana/Indianapolis",
  })
}

// One-day front door codes for people who aren't customers (landlord,
// contractors). Each works midnight to midnight on its day, then the
// revoke-access cron deletes it.
export default function GuestCodes({ codes, today }: { codes: GuestCode[]; today: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<GuestCode | null>(null)

  function submit(formData: FormData) {
    setError(null)
    setCreated(null)
    startTransition(async () => {
      try {
        setCreated(await createGuestCodeAction(formData))
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create the code")
      }
    })
  }

  function revoke(id: string) {
    startTransition(async () => {
      try {
        await revokeGuestCodeAction(id)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to turn off the code")
      }
    })
  }

  return (
    <section className="mb-8 rounded-xl border border-white/10 bg-white/5 p-4">
      <h2 className="text-sm font-semibold text-white">Guest codes</h2>
      <p className="mt-1 text-xs text-neutral-500">A front door code for one day, midnight to midnight. No bay or booking.</p>

      <form action={submit} className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="guest-name">Name</label>
          <input id="guest-name" name="name" type="text" required placeholder="e.g. Landlord" className="input mt-1" />
        </div>
        <div>
          <label className="label" htmlFor="guest-date">Day</label>
          <input id="guest-date" name="date" type="date" required defaultValue={today} min={today} className="input mt-1" />
        </div>
        <button type="submit" disabled={isPending} className="btn-primary whitespace-nowrap disabled:opacity-50">
          {isPending ? "Working..." : "Create code"}
        </button>
      </form>
      {created && (
        <p className="mt-2 text-sm text-green-400">
          {created.name}: <span className="font-mono text-lg">{created.pin_code}</span> works {dayLabel(created.starts_at)}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {codes.length > 0 && (
        <div className="mt-4 divide-y divide-white/5 rounded-lg border border-white/10">
          {codes.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-3 py-2 text-sm">
              <span className="flex-1 text-white">{c.name}</span>
              <span className="font-mono text-white">{c.pin_code}</span>
              <span className="w-28 text-xs text-neutral-400">{dayLabel(c.starts_at)}</span>
              <button type="button" disabled={isPending} onClick={() => revoke(c.id)}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                Turn off
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
