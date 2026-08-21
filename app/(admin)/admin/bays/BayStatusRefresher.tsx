"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Refetches the bays page the moment a bay agent's heartbeat (or an admin
// override) writes to bay_agent_status, so the live status section updates on
// its own. Same pattern as admin/sms/RealtimeRefresher.tsx. Debounced because
// an agent heartbeats every ~10-15s per bay - four bays checking in close
// together shouldn't mean four back-to-back refreshes.
export default function BayStatusRefresher() {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("admin-bay-agent-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bay_agent_status" },
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
