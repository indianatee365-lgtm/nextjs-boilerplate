"use client"

import { useState } from "react"

export default function SendPastDueNudgeButton({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [message, setMessage] = useState("")

  async function send() {
    setState("sending")
    try {
      const res = await fetch("/api/admin/send-subscription-past-due", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, channel: "both" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send")
      const skippedNote = data.skipped?.length ? ` (skipped: ${data.skipped.join(", ")})` : ""
      setMessage(`Sent: ${data.sent?.join(", ") || "none"}${skippedNote}`)
      setState("sent")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to send")
      setState("error")
    }
  }

  if (state === "sent") {
    return <p className="text-xs text-green-400 mt-2">{message}</p>
  }

  return (
    <div className="mt-2">
      <button
        onClick={send}
        disabled={state === "sending"}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black hover:brightness-95 disabled:opacity-50"
        style={{ backgroundColor: "var(--brand)" }}
      >
        {state === "sending" ? "Sending..." : "Send past-due nudge (SMS + email)"}
      </button>
      {state === "error" && <p className="text-xs text-red-400 mt-1">{message}</p>}
    </div>
  )
}
