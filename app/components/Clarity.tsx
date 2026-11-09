"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

// Microsoft Clarity session recordings and heatmaps, for the public site only.
// Admin and account pages show customer names, phone numbers and door codes,
// so recording stops whenever the visitor is on one of them, and the script is
// never loaded at all for a visit that starts there.
const PRIVATE_PATH = /^\/(admin|account)(\/|$)/

type ClarityFn = (command: string) => void

export function Clarity({ projectId, nonce }: { projectId: string; nonce?: string }) {
  const pathname = usePathname()
  const isPrivate = PRIVATE_PATH.test(pathname)
  const [load] = useState(() => !isPrivate)

  useEffect(() => {
    const clarity = (window as unknown as { clarity?: ClarityFn }).clarity
    if (clarity) clarity(isPrivate ? "stop" : "start")
  }, [isPrivate])

  if (!load) return null
  return (
    <Script id="clarity" strategy="afterInteractive" nonce={nonce}>
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(projectId)});`}
    </Script>
  )
}
