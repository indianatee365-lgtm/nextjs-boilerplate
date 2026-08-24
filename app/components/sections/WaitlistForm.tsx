"use client"

import { useState } from "react"

export default function WaitlistForm() {
  const [firstName, setFirstName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("loading")
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email }),
      })
      if (res.ok) {
        setStatus("success")
        setFirstName("")
        setEmail("")
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  if (status === "success") {
    return <p className="mt-4 text-sm text-green-400">You&apos;re in - look out for a welcome email shortly</p>
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="first-name" className="sr-only">Name</label>
        <input
          id="first-name"
          type="text"
          required
          placeholder="Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full flex-1 rounded-xl border-2 border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-white/30"
        />
        <label htmlFor="email-address" className="sr-only">Email address</label>
        <input
          id="email-address"
          type="email"
          required
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full flex-1 rounded-xl border-2 border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none transition focus:border-white/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-xl bg-white/10 px-4 py-2 text-center text-sm font-semibold text-neutral-300 transition hover:bg-white/20 disabled:opacity-50"
        >
          {status === "loading" ? "Joining…" : "Join"}
        </button>
      </form>

      {status === "error" && (
        <p className="mt-2 text-xs text-red-400">Something went wrong. Please try again.</p>
      )}
    </>
  )
}
