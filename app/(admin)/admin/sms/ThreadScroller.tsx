"use client"

import { useLayoutEffect, useRef } from "react"

// How close to the bottom (px) still counts as "reading the latest".
const NEAR_BOTTOM_PX = 120

/**
 * The conversation's scroll box. Opens at the newest message, and when a new
 * one lands (the inbox refreshes itself, see RealtimeRefresher) it follows it
 * down, unless the admin has scrolled up to read older messages, in which case
 * it leaves them where they are. Before this the box just stayed wherever it
 * was, so a new text arrived out of sight below.
 */
export default function ThreadScroller({
  phone,
  lastMessageId,
  className,
  children,
}: {
  phone: string
  lastMessageId: string | null
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const shownPhone = useRef<string | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (shownPhone.current !== phone || nearBottom.current) {
      el.scrollTop = el.scrollHeight
      nearBottom.current = true
    }
    shownPhone.current = phone
  }, [phone, lastMessageId])

  return (
    <div
      ref={ref}
      className={className}
      onScroll={(e) => {
        const el = e.currentTarget
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
      }}
    >
      {children}
    </div>
  )
}
