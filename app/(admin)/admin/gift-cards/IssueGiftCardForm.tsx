"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { issueGiftCard } from "./actions"

export default function IssueGiftCardForm() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [sendEmail, setSendEmail] = useState(true)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function reset() {
    setAmount(""); setRecipientName(""); setRecipientEmail("")
    setSendEmail(true); setError(""); setOpen(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return }
    setError("")
    startTransition(async () => {
      try {
        await issueGiftCard({
          amount: amt,
          recipientName: recipientName.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          sendEmail,
        })
        reset()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong")
      }
    })
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary px-4 py-2 text-sm">
        Issue gift card
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 mx-4">
        <h2 className="text-lg font-semibold text-white mb-5">Issue gift card</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Amount ($)</label>
            <input type="number" min={1} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} className="input mt-1" placeholder="50.00" required />
          </div>
          <div>
            <label className="label">Recipient name <span className="text-neutral-500">(optional)</span></label>
            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="input mt-1" placeholder="Jane Doe" />
          </div>
          <div>
            <label className="label">Recipient email <span className="text-neutral-500">(optional)</span></label>
            <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className="input mt-1" placeholder="jane@example.com" />
          </div>
          {recipientEmail && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-300">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-green-500" />
              Send gift card email to recipient
            </label>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1">
              {isPending ? "Issuing…" : "Issue card"}
            </button>
            <button type="button" onClick={reset} disabled={isPending} className="btn-ghost px-4">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
