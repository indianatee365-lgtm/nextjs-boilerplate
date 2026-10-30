"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// While the Door Log is on screen it asks /api/admin/door/latest this often
// whether a new unlock has landed, and re-renders only if one has.
const POLL_MS = 5_000

// Same check-a-one-row-endpoint approach as admin/sms's RealtimeRefresher,
// minus the realtime socket: door_entries has RLS on with no policies, so a
// browser subscription would never receive its rows anyway. Checking stops
// while the tab is hidden and runs again the moment it comes back into view.
export default function DoorRefresher() {
  const router = useRouter()

  useEffect(() => {
    // The newest unlock this page last saw. Starts unknown: the first check
    // only records it, since the page was just rendered with fresh data.
    let lastSeen: string | null = null
    let checking = false
    const checkForNew = async () => {
      if (checking) return
      checking = true
      try {
        const res = await fetch("/api/admin/door/latest", { cache: "no-store" })
        if (!res.ok) return
        const { latest } = (await res.json()) as { latest: string }
        if (lastSeen !== null && latest !== lastSeen) router.refresh()
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
    }
  }, [router])

  return null
}
