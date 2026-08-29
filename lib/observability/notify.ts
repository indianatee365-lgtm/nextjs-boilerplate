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

export async function notifyOwner(msg: string): Promise<void> {
  let ok = false
  let errDetail = ""
  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.TELNYX_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.TELNYX_PHONE_NUMBER,
        to: "+15749990622",
        text: msg,
      }),
    })
    if (res.ok) {
      ok = true
    } else {
      const body = await res.json().catch(() => ({}))
      errDetail = `status=${res.status} body=${JSON.stringify(body).slice(0, 200)}`
    }
  } catch (err) {
    errDetail = String(err).slice(0, 200)
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
