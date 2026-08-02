"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"

// Disables the moment a form submission starts, not just after the server
// responds - on a slow connection the visible tap-to-response gap is exactly
// where repeated taps fire off duplicate sends. The spinner matters as much
// as the disable: a static "Sending..." label still reads as "stuck" and
// invites another tap, a moving spinner reads as "working."
export function SubmitButton({
  children,
  pendingText = "Sending...",
  className,
}: {
  children: React.ReactNode
  pendingText?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 size={14} className="animate-spin" />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
