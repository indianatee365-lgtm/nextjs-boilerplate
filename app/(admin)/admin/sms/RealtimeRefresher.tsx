"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Refetches the inbox the moment the Telnyx webhook writes a new row (or an
// admin replies from another tab/device), so the page updates on its own
// instead of needing a manual reload to see new texts land. Renders nothing -
// it only exists to trigger router.refresh(), which re-runs the Server
// Component with fresh data.
//
// Debounced because a group broadcast inserts one row per recipient in quick
// succession - without this, sending to 30 people would fire 30 refreshes.
export default function RealtimeRefresher() {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("admin-sms-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sms_messages" },
        () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => router.refresh(), 300)
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
