import { createServiceClient } from "@/lib/supabase/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// Looks up a customer's display name for owner-facing SMS alerts, so
// Jerrod gets a readable name on his phone instead of a raw UUID he can't
// act on without pulling up the admin panel. Falls back to the id itself
// on any lookup failure or missing profile - degrades gracefully rather
// than losing the alert.
export async function getCustomerName(supabase: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .maybeSingle()
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ")
    return name || userId
  } catch {
    return userId
  }
}

// Same idea as getCustomerName, but keyed by phone - for alerts that only
// have the raw number on hand (e.g. an inbound SMS webhook), like the
// admin SMS inbox's own phone-number lookup. Falls back to the phone
// itself on any lookup failure or unmatched number.
export async function getCustomerNameByPhone(supabase: SupabaseClient, phone: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("phone", phone)
      .maybeSingle()
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ")
    return name || phone
  } catch {
    return phone
  }
}

// Reads an admin_settings toggle (see 20260831_admin_settings.sql). Fails
// open (true) on any lookup error or missing row - a settings-table hiccup
// must never be the reason a real notification silently never fires.
export async function getAdminSetting(supabase: SupabaseClient, key: string): Promise<boolean> {
  try {
    const { data } = await supabase.from("admin_settings").select("value").eq("key", key).maybeSingle()
    return data?.value ?? true
  } catch {
    return true
  }
}

// "1hr" / "1.5hr" / "2hr" - bookings are always in 30-min increments, so this
// never needs to handle an odd remainder. Used in owner-notification text so
// a low total (e.g. a 30-min session) doesn't read as a pricing mistake -
// see 2026-08-31, Jerrod double-checking the pricing table over what was
// actually just a short booking.
export function formatDuration(minutes: number): string {
  const hours = minutes / 60
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}hr`
}

// Jerrod's cell. Every owner alert in the system lands here.
const OWNER_PHONE = "+15749990622"

export async function notifyOwner(msg: string): Promise<void> {
  let ok = false
  let errDetail = ""
  let messageId = ""
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.TELNYX_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.TELNYX_PHONE_NUMBER,
        to: OWNER_PHONE,
        text: msg,
      }),
    })
    if (res.ok) {
      ok = true
      // Capture Telnyx's message id so a message that was accepted here but
      // never arrived on the phone can actually be traced in their portal.
      // On 2026-09-11 a real customer booking (Kolton Parnell, Bay 4) sent no
      // owner notification, and it was impossible to tell whether this
      // function was even called, because success was silent: only failures
      // were ever logged. Owner alerts sent minutes later did arrive, so the
      // Telnyx path itself was working. Without an accepted-message id there
      // is nothing to chase.
      const body = await res.json().catch(() => ({}))
      messageId = (body as { data?: { id?: string } })?.data?.id ?? ""
    } else {
      const body = await res.json().catch(() => ({}))
      errDetail = `status=${res.status} body=${JSON.stringify(body).slice(0, 200)}`
    }
  } catch (err) {
    errDetail = String(err).slice(0, 200)
  }

  if (ok) {
    // Deliberately logged on SUCCESS too, not just failure. An owner alert
    // that silently never fires is indistinguishable from one that fired and
    // was dropped by the carrier, and that ambiguity cost a real missed
    // customer arrival. This row is the difference between the two.
    try {
      const sc = await createServiceClient()
      // Deliberately the same kind= / to= / subject= shape that sendSmsMessage
      // and sendResendEmail use, because /admin/logs?filter=communications
      // parses exactly that and can then render owner alerts in the same
      // table as everything else, with no special case. subject MUST stay
      // last: that parser reads it as (.+)$ to the end of the line.
      const { error } = await sc.from("admin_logs").insert({
        event: "notify-owner-sent",
        detail: `kind=owner-alert to=${OWNER_PHONE} telnyx_id=${messageId || "unknown"} subject=${msg.slice(0, 160)}`,
      })
      if (error) console.error("admin_logs insert failed (notify-owner-sent):", error, { msg })
    } catch (err) {
      console.error("notifyOwner success logging threw:", err, { msg })
    }
    return
  }

  if (!ok) {
    try {
      const sc = await createServiceClient()
      const { error } = await sc.from("admin_logs").insert({
        event: "notify-owner-FAILED",
        detail: `${errDetail} | msg=${msg.slice(0, 100)}`,
      })
      // Supabase-js resolves with {error}, it does not throw - so this check
      // is required, not the try/catch. Without it, a bad insert (schema
      // mismatch, RLS, etc.) fails completely silently: no log row, no
      // exception, nothing in Vercel logs either. console.error at least
      // gets it into Vercel's function logs even when the DB write itself
      // is what's broken.
      if (error) console.error("admin_logs insert failed (notify-owner-FAILED):", error, { msg })
    } catch (err) {
      console.error("notifyOwner logging threw:", err, { msg })
    }
  }
}

export async function logEvent(
  supabase: SupabaseClient,
  event: string,
  detail: string,
): Promise<void> {
  try {
    const { error } = await supabase.from("admin_logs").insert({ event, detail })
    if (error) console.error(`admin_logs insert failed (${event}):`, error, { detail })
  } catch (err) {
    console.error(`logEvent threw (${event}):`, err, { detail })
  }
}

export async function logFailure(
  supabase: SupabaseClient,
  event: string,
  detail: string,
  alertMsg?: string,
): Promise<void> {
  await Promise.allSettled([
    logEvent(supabase, event, detail),
    alertMsg ? notifyOwner(alertMsg) : Promise.resolve(),
  ])
}
