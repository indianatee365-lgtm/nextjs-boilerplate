"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { extendActiveBooking } from "./actions"

// The plain <form action={...}> version of this button gave zero feedback -
// click it and nothing visibly happens until the next full page revalidate,
// so there's no way to tell a click landed from one that silently failed
// (e.g. "no active booking" or a conflict with what's booked next). Jerrod's
// ask 2026-09-06 after extending a live customer's time and having no way to
// confirm it actually took.
export default function ExtendBookingButton({ bayId }: { bayId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ kind: "success" | "error"; text: string } | null>(null)

  function handleClick() {
    setResult(null)
    startTransition(async () => {
      try {
        const { newEndsAt } = await extendActiveBooking(bayId, 15)
        const time = new Date(newEndsAt).toLocaleTimeString("en-US", {
          hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
        })
        setResult({ kind: "success", text: `Extended to ${time}` })
        router.refresh()
      } catch (err) {
        setResult({ kind: "error", text: err instanceof Error ? err.message : "Extend failed" })
      }
      setTimeout(() => setResult(null), 6000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:border-white/30 disabled:opacity-50"
      >
        {isPending ? "Extending…" : "Extend +15 min"}
      </button>
      {result && (
        <span className={`text-xs font-medium ${result.kind === "success" ? "text-green-400" : "text-red-400"}`}>
          {result.kind === "success" ? "✓ " : ""}{result.text}
        </span>
      )}
    </div>
  )
}
