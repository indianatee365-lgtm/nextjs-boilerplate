"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// While the inbox is on screen it re-checks every POLL_MS, so a new text shows
// up within seconds whether or not the realtime socket below is working.
const POLL_MS = 15_000

// Refetches the inbox the moment the Telnyx webhook writes a new row (or an
// admin replies from another tab/device), so the page updates on its own
// instead of needing a manual reload to see new texts land. Renders nothing -
// it only exists to trigger router.refresh(), which re-runs the Server
// Component with fresh data.
//
// Debounced because a group broadcast inserts one row per recipient in quick
// succession - without this, sending to 30 people would fire 30 refreshes.
//
// The realtime socket alone was not enough: on 2026-10-17 Jerrod was still
// reloading by hand to see new texts. A socket that drops (a phone locking, a
// laptop sleeping, a network blip) or subscribes before the session is attached
// fails silently, so the page now also polls while visible and refreshes the
// moment it comes back into view. Polling stops while the tab is hidden so a
// forgotten background tab costs nothing.
export default function RealtimeRefresher() {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const refreshSoon = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => router.refresh(), 300)
    }

    const supabase = createClient()
    const channel = supabase
      .channel("admin-sms-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_messages" },
        refreshSoon
      )
      .subscribe()

    let pollId: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (pollId === null) pollId = setInterval(() => router.refresh(), POLL_MS)
    }
    const stopPolling = () => {
      if (pollId !== null) clearInterval(pollId)
      pollId = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshSoon()
        startPolling()
      } else {
        stopPolling()
      }
    }

    if (document.visibilityState === "visible") startPolling()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", refreshSoon)

    return () => {
      stopPolling()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", refreshSoon)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
