import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendAdminReplySms } from "@/lib/telnyx/sms"
import { logEvent } from "@/lib/observability/notify"

/**
 * Send one text, from the Tee365 number, to one existing customer, on
 * Jerrod's say-so. For one-off messages when the admin SMS page can't be
 * used (added 2026-10-08 to message a Birdie member). Behind CRON_SECRET like
 * the scheduled jobs, and deliberately narrow:
 *   * the recipient must be an existing profile with texting turned on
 *   * the message is stored in sms_messages, so it appears in /admin/sms and
 *     any reply threads with it
 *   * the same text to the same person is refused within 10 minutes
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { userId, body } = await request.json().catch(() => ({}))
  const text = typeof body === "string" ? body.trim() : ""
  if (typeof userId !== "string" || !text || text.length > 1200) {
    return NextResponse.json({ error: "userId and body required" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: profile } = await db.from("profiles").select("phone, sms_consent").eq("id", userId).maybeSingle()
  const p = profile as { phone: string | null; sms_consent: boolean } | null
  if (!p?.phone || !p.sms_consent) {
    return NextResponse.json({ error: "No phone or texting is turned off for this customer" }, { status: 400 })
  }

  const { data: recent } = await db.from("sms_messages")
    .select("id").eq("phone_number", p.phone).eq("direction", "outbound").eq("body", text)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1)
  if (recent && recent.length > 0) return NextResponse.json({ ok: true, duplicate: true })

  await sendAdminReplySms(p.phone, text)
  await db.from("sms_messages").insert({ phone_number: p.phone, direction: "outbound", body: text })
  await logEvent(db, "owner-sms-sent", `user=${userId}`)
  return NextResponse.json({ ok: true })
}
