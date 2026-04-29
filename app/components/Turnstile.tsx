"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    __turnstileVerified?: () => void
    __turnstileExpired?: () => void
  }
}

export function Turnstile({ onVerified }: { onVerified?: (verified: boolean) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return

    window.__turnstileVerified = () => onVerified?.(true)
    window.__turnstileExpired = () => onVerified?.(false)

    const id = "cf-turnstile-script"
    if (!document.getElementById(id)) {
      const script = document.createElement("script")
      script.id = id
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    return () => {
      delete window.__turnstileVerified
      delete window.__turnstileExpired
    }
  }, [siteKey, onVerified])

  if (!siteKey) return null

  return (
    <div
      className="cf-turnstile"
      data-sitekey={siteKey}
      data-theme="dark"
      data-callback="__turnstileVerified"
      data-expired-callback="__turnstileExpired"
    />
  )
}
