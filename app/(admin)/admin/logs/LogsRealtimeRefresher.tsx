"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Same pattern as admin/sms's RealtimeRefresher: refetch the page whenever a
// new admin_logs row lands, so failures and alerts appear as they happen
// instead of on a manual reload. Renders nothing - it exists only to call
// router.refresh(), which re-runs the Server Component with fresh data.
//
// Debounced harder than the others: a single booking or cron run can emit
// several log lines in a burst, and this page is a pure read-out where
// arriving a beat late costs nothing.
export default function LogsRealtimeRefresher() {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("admin-logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_logs" },
        () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => router.refresh(), 800)
        }
      )
      .subscribe()

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
