"use client"

import { useFormStatus } from "react-dom"

// Disables the moment a form submission starts, not just after the server
// responds - on a slow connection the visible tap-to-response gap is exactly
// where repeated taps fire off duplicate sends.
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
      {pending ? pendingText : children}
    </button>
  )
}
