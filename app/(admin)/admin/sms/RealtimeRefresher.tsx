"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// While the inbox is on screen it asks /api/admin/sms/latest this often whether
// anything new has arrived, and re-renders only if it has.
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
// fails silently. So the page also checks for a newer message while visible,
// and as soon as it comes back into view. It checks a one-row endpoint rather
// than calling router.refresh() on a timer, because every refresh also
// re-prefetches all the admin nav links (about a dozen requests). Checking
// stops while the tab is hidden so a forgotten background tab costs nothing.
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

    // The newest message this page last saw. Starts unknown: the first check
    // only records it, since the page was just rendered with fresh data.
    let lastSeen: string | null = null
    let checking = false
    const checkForNew = async () => {
      if (checking) return
      checking = true
      try {
        const res = await fetch("/api/admin/sms/latest", { cache: "no-store" })
        if (!res.ok) return
        const { latest } = (await res.json()) as { latest: string }
        if (lastSeen !== null && latest !== lastSeen) refreshSoon()
        lastSeen = latest
      } catch {
        // A blip; the next tick tries again.
      } finally {
        checking = false
      }
    }

    let pollId: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (pollId === null) pollId = setInterval(checkForNew, POLL_MS)
    }
    const stopPolling = () => {
      if (pollId !== null) clearInterval(pollId)
      pollId = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkForNew()
        startPolling()
      } else {
        stopPolling()
      }
    }

    checkForNew()
    if (document.visibilityState === "visible") startPolling()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", checkForNew)

    return () => {
      stopPolling()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", checkForNew)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
