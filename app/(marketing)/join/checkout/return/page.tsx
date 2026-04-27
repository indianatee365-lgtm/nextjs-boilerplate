"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"

function ReturnContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "success" | "open" | "error">("loading")

  useEffect(() => {
    const sessionId = searchParams.get("session_id")
    if (!sessionId) {
      setStatus("error")
      return
    }

    fetch(`/api/memberships/checkout/status?session_id=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.status === "complete") {
          setStatus("success")
          setTimeout(() => router.push("/account?membership=joined"), 2500)
        } else if (data.status === "open") {
          setStatus("open")
        } else {
          setStatus("error")
        }
      })
      .catch(() => setStatus("error"))
  }, [searchParams, router])

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <p className="text-neutral-400">Confirming your membership…</p>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">You&apos;re in.</h1>
        <p className="text-neutral-400 mb-2">Welcome to Tee365. Your membership is active.</p>
        <p className="text-sm text-neutral-500">Heading to your account…</p>
      </div>
    )
  }

  if (status === "open") {
    return (
      <div className="text-center">
        <p className="text-neutral-300 mb-4">Your payment is still processing. Check your account in a moment.</p>
        <button onClick={() => router.push("/account")} className="btn-primary">Go to my account</button>
      </div>
    )
  }

  return (
    <div className="text-center">
      <p className="text-red-400 mb-4">Something went wrong with your payment.</p>
      <button onClick={() => router.push("/join")} className="btn-secondary">Back to plans</button>
    </div>
  )
}

export default function ReturnPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={<div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />}>
        <ReturnContent />
      </Suspense>
    </div>
  )
}
