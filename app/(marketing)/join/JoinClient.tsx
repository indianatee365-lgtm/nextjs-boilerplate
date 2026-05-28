"use client"

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
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(`/join/checkout?plan=${planSlug}`)}
      disabled={disabled}
      className={className}
    >
      {label}
    </button>
  )
}
