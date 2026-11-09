// Booking funnel tracking for /book. One event per step per browser tab
// (the server ignores repeats), read back on /admin/funnel. Fire and forget:
// it never throws and never holds up the booking itself.
export type FunnelStep = "view" | "date" | "time" | "login" | "reserved"

const KEY = "t365_funnel_session"
let fallbackSessionId: string | null = null

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // Private mode or blocked storage: still count this page load.
    fallbackSessionId ??= crypto.randomUUID()
    return fallbackSessionId
  }
}

export function trackFunnel(step: FunnelStep, bookingId?: string) {
  try {
    fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId(), step, bookingId }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Never let tracking break the page.
  }
}
