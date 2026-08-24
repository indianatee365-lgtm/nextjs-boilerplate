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
//
// Found live 2026-08-24: the channel has to be opened AFTER the browser
// client has a confirmed session, not immediately on mount - subscribing
// before the cookie-based session finishes hydrating opens the socket
// unauthenticated, and since shots is RLS-protected, an unauthenticated
// subscriber's postgres_changes filter never matches anything (silent, no
// error) even though the subscription itself reports SUBSCRIBED. Admin
// pages using this same pattern elsewhere didn't hit this because an admin
// who just navigated within the authenticated app already has a hydrated
// session by the time the component mounts; a customer landing here can
// race it.
export default function ShotsRealtimeRefresher({ userId, bookingId }: { userId: string; bookingId?: string }) {
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Belt-and-suspenders (Jerrod's ask 2026-08-24, after the auth-timing fix
  // above still didn't make the live page auto-update): a plain poll every
  // few seconds while this page is open, independent of whatever the
  // WebSocket subscription is doing. Guarantees an update lands within one
  // polling interval no matter what's wrong with realtime - cheap and far
  // more robust than continuing to chase realtime auth edge cases blind,
  // without direct access to the browser console that's actually failing.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(interval)
  }, [router])

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session) {
        supabase.realtime.setAuth(session.access_token)
      }

      const filter = bookingId ? `booking_id=eq.${bookingId}` : `user_id=eq.${userId}`
      channel = supabase
        .channel(`shots-${bookingId ?? userId}`)
        .on(
          // "*" not just INSERT - a shot's club/total-distance often arrive
          // a few seconds later via a PATCH (see /api/bay-agent/shot's
          // PATCH handler), so the UI needs UPDATE events too.
          "postgres_changes",
          { event: "*", schema: "public", table: "shots", filter },
          () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = setTimeout(() => router.refresh(), 300)
          }
        )
        .subscribe()
    })

    return () => {
      cancelled = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [router, userId, bookingId])

  return null
}
