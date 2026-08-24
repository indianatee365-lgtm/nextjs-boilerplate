"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

// Same pattern as admin/sms/RealtimeRefresher.tsx - refetches the page the
// moment companion.py's shot-capture thread (or the phone/kiosk who's-up
// flow) writes a new shots row, instead of the customer having to hit
// refresh mid-round to see what they just hit. Scoped to bookingId when on a
// single session's detail page (tighter filter, fewer irrelevant refreshes);
// falls back to userId on the sessions-list page so a brand new session
// still shows up on its own. RLS (shots_select_own) is what actually keeps
// this from ever receiving another customer's inserts - the filter here is
// just to avoid needless refreshes, not the security boundary.
export default function ShotsRealtimeRefresher({ userId, bookingId }: { userId: string; bookingId?: string }) {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const filter = bookingId ? `booking_id=eq.${bookingId}` : `user_id=eq.${userId}`
    const channel = supabase
      .channel(`shots-${bookingId ?? userId}`)
      .on(
        // "*" (not just INSERT) - a shot's club name often arrives a few
        // seconds later via a PATCH (see /api/bay-agent/shot's PATCH
        // handler), so the UI needs to pick up that UPDATE too, not just
        // the initial row.
        "postgres_changes",
        { event: "*", schema: "public", table: "shots", filter },
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
  }, [router, userId, bookingId])

  return null
}
