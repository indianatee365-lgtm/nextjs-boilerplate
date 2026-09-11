"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Same pattern as admin/sms's RealtimeRefresher: refetch the page the moment a
// booking row changes, so a booking that lands (or gets cancelled, or paid)
// shows up without a manual reload. Renders nothing - it exists only to call
// router.refresh(), which re-runs the Server Component with fresh data.
//
// Debounced because a single checkout writes the booking and then updates it
// again moments later (payment confirmation, access code), and the admin
// bookings page is heavy enough that refetching it three times in a second is
// wasted work.
export default function BookingsRealtimeRefresher() {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("admin-bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current)
          timeoutRef.current = setTimeout(() => router.refresh(), 400)
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
