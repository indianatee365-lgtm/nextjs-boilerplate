import { createServiceClient } from "@/lib/supabase/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

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
      await sc.from("admin_logs").insert({
        event: "notify-owner-FAILED",
        detail: `${errDetail} | msg=${msg.slice(0, 100)}`,
      })
    } catch { /* logging must never throw */ }
  }
}

export async function logEvent(
  supabase: SupabaseClient,
  event: string,
  detail: string,
): Promise<void> {
  try {
    await supabase.from("admin_logs").insert({ event, detail })
  } catch {
    /* logging must never block the caller */
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
