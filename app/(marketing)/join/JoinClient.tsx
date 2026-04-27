"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function JoinButton({
  planSlug,
  label,
  className,
  disabled,
}: {
  planSlug: string
  label: string
  className?: string
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/memberships/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug }),
      })

      if (res.status === 401) {
        router.push(`/login?returnUrl=/join`)
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Something went wrong")
        setLoading(false)
        return
      }

      window.location.href = data.url
    } catch {
      setError("Connection error — please try again")
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading || disabled}
        className={className}
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  )
}
