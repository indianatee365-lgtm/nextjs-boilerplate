"use client"

import { useEffect } from "react"

export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return
    const id = "cf-turnstile-script"
    if (document.getElementById(id)) return
    const script = document.createElement("script")
    script.id = id
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }, [siteKey])

  if (!siteKey) return null

  return (
    <div
      className="cf-turnstile"
      data-sitekey={siteKey}
      data-theme="dark"
    />
  )
}
