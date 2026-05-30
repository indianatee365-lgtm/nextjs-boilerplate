/**
 * Owner-facing telemetry helpers. Use these in any code path that handles
 * money, customer experience, or physical access — anything where a silent
 * failure would be discovered late.
 *
 * - logEvent: write a row to admin_logs (audit trail)
 * - notifyOwner: SMS the owner (use sparingly, only for things requiring action)
 * - logFailure: convenience wrapper for failure + optional SMS
 */

export async function notifyOwner(msg: string): Promise<void> {
  await fetch("https://api.telnyx.com/v2/messages", {
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
  }).catch(() => {})
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

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
