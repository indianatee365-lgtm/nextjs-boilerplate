"use client"

import { useState } from "react"

/**
 * Manual send of the membership-ended notice, for members whose subscription
 * was deleted before that notice existed. Preview first, then send: this goes
 * to a real customer and there is no unsending it.
 */
export default function SendCancelledNoticeButton({ userId }: { userId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "preview" | "sent" | "error">("idle")
  const [message, setMessage] = useState("")
  const [smsBody, setSmsBody] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [target, setTarget] = useState<{ phone: string | null; email: string | null; smsConsent: boolean } | null>(null)

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/send-subscription-cancelled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Request failed")
    return data
  }

  async function loadPreview() {
    setState("loading")
    try {
      const data = await call({ channel: "both", preview: true })
      setSmsBody(data.smsBody)
      setEmailSubject(data.emailSubject)
      setTarget(data.to)
      setState("preview")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load preview")
      setState("error")
    }
  }

  async function send() {
    setState("loading")
    try {
      const data = await call({ channel: "both" })
      const skippedNote = data.skipped?.length ? ` (skipped: ${data.skipped.join(", ")})` : ""
      setMessage(`Sent: ${data.sent?.join(", ") || "none"}${skippedNote}`)
      setState("sent")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to send")
      setState("error")
    }
  }

  if (state === "sent") {
    return <p className="mt-2 text-xs text-green-400">{message}</p>
  }

  if (state === "preview") {
    return (
      <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">SMS preview</p>
        <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-neutral-300">{smsBody}</pre>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Email subject</p>
        <p className="mt-1.5 text-xs text-neutral-300">{emailSubject}</p>
        <p className="mt-3 text-xs text-neutral-500">
          To: {target?.phone ?? "no phone"}{target && !target.smsConsent ? " (no SMS consent, will skip)" : ""}
          {" · "}{target?.email ?? "no email"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={send}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-black hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Send it
          </button>
          <button
            onClick={() => setState("idle")}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <button
        onClick={loadPreview}
        disabled={state === "loading"}
        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/5 disabled:opacity-50"
      >
        {state === "loading" ? "Working..." : "Preview membership-ended notice"}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-400">{message}</p>}
    </div>
  )
}
