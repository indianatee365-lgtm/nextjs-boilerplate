import { NextRequest, NextResponse } from "next/server"
import { sendInfoSms } from "@/lib/telnyx/sms"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyOwner, logEvent } from "@/lib/observability/notify"

const OWNER_PHONE = "+15749990622"

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return raw.startsWith("+") ? raw : "+" + raw
}

function parseArgs(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw) } catch { return {} }
  }
  if (raw && typeof raw === "object") return raw as Record<string, string>
  return {}
}

async function handleLookupMembership(phone: string): Promise<string> {
  const supabase = await createServiceClient()
  const normalized = normalizePhone(phone)

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name")
    .eq("phone", normalized)
    .single()

  if (!profile) {
    return "No account found for that phone number. They may be registered under a different number, or may not have a membership yet."
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("plan_type, founder_status_active, membership_paused, current_period_end")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!membership) {
    return `Found account for ${profile.first_name ?? "that number"} but no active membership.`
  }

  const parts: string[] = []
  parts.push(`Member: ${profile.first_name ?? "unknown"}`)
  parts.push(`Plan: ${membership.plan_type}`)
  if (membership.founder_status_active) parts.push("Founding member: yes")
  if (membership.membership_paused) parts.push("Status: PAUSED")
  else parts.push("Status: active")
  if (membership.current_period_end) {
    const nextCharge = new Date(membership.current_period_end)
    parts.push(`Next charge: ${nextCharge.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })}`)
  }

  return parts.join(". ")
}

async function handleLookupUpcomingBooking(phone: string): Promise<string> {
  const supabase = await createServiceClient()
  const normalized = normalizePhone(phone)

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name")
    .eq("phone", normalized)
    .single()

  if (!profile) {
    return "No account found for that phone number."
  }

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, access_code, bay_id, bays(number, name)")
    .eq("user_id", profile.id)
    .gte("ends_at", now.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)

  if (!bookings || bookings.length === 0) {
    return `No upcoming bookings found for ${profile.first_name ?? "that account"} in the next 24 hours.`
  }

  const b = bookings[0]
  const bay = (b as { bays?: { number: number; name: string } | null }).bays
  const start = new Date(b.starts_at)
  const end = new Date(b.ends_at)
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" }
  const startStr = start.toLocaleTimeString("en-US", opts)
  const endStr = end.toLocaleTimeString("en-US", opts)
  const dateStr = start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Indiana/Indianapolis" })

  const parts: string[] = []
  parts.push(`Booking for ${profile.first_name ?? "member"}: ${dateStr}, ${startStr} to ${endStr}`)
  if (bay) parts.push(`Bay ${bay.number} (${bay.name})`)
  if (b.access_code) parts.push(`Access code: ${b.access_code}`)
  else parts.push("No access code assigned yet")

  return parts.join(". ")
}

async function handleSendInfoSms(callerPhone: string): Promise<string> {
  if (!callerPhone || callerPhone === "unknown") {
    return "I wasn't able to get your phone number from the call. Would you like me to read it instead?"
  }
  try {
    await sendInfoSms(callerPhone)
    return "Done. Sent the website and email to your phone."
  } catch (err) {
    console.error("[send_info_sms] failed", { callerPhone, err })
    return "Sorry, the text didn't go through. Would you like me to read it instead?"
  }
}

async function handleCaptureEventLead(args: Record<string, string>, callerPhone: string): Promise<string> {
  const name = args.name?.trim() || "unknown"
  const eventType = args.event_type?.trim() || "unspecified"
  const eventDate = args.event_date?.trim() || "unspecified"
  const phone = args.phone?.trim() || callerPhone || "unknown"

  try {
    const supabase = await createServiceClient()
    await supabase.from("event_leads").insert({
      name,
      event_type: eventType,
      event_date: eventDate,
      phone,
      caller_phone: callerPhone || null,
    })
  } catch (err) {
    console.error("[capture_event_lead] db insert failed", err)
  }

  const smsText = [
    "Tee365 event lead:",
    `Name: ${name}`,
    `Type: ${eventType}`,
    `Date: ${eventDate}`,
    `Phone: ${phone}`,
  ].join("\n")

  try {
    await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.TELNYX_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.TELNYX_PHONE_NUMBER,
        to: OWNER_PHONE,
        text: smsText,
      }),
    })
  } catch (err) {
    console.error("[capture_event_lead] sms failed", err)
  }

  return "Got it. I have sent your information to Jerrod and I will transfer you to him now."
}

// transferCall used to be Vapi's native predefined tool type, which dials the
// destination entirely inside Vapi/Telnyx with zero visibility to us. On
// 2026-07-26 a transfer silently failed - Telnyx accepted the transfer
// command but never placed the second call leg, so the owner's phone never
// rang and nobody found out. This custom function tool alerts the owner
// immediately, before attempting the live transfer, so a failure on Telnyx's
// side is no longer silent.
async function handleTransferToHuman(
  args: Record<string, string>,
  callerPhone: string,
  call: Record<string, unknown> | undefined
): Promise<string> {
  const reason = args.reason?.trim() || "needs help"
  const callerName = await lookupCallerName(callerPhone)
  const supabase = await createServiceClient()
  const who = callerName ? `${callerName} (${callerPhone})` : callerPhone

  await Promise.allSettled([
    notifyOwner(`Tee365 call transfer: connecting ${who} to you now. Reason: ${reason}. If your phone doesn't ring in the next minute, call them back - the transfer may have failed silently.`),
    logEvent(supabase, "call-transfer-initiated", `caller=${callerPhone} name=${callerName ?? "unknown"} reason=${reason}`),
  ])

  const controlUrl = (call?.monitor as Record<string, unknown> | undefined)?.controlUrl as string | undefined
  if (!controlUrl) {
    console.error("[transfer_to_human] no monitor.controlUrl on call object", { callId: call?.id })
    await logEvent(supabase, "call-transfer-control-FAILED", `no controlUrl, caller=${callerPhone}`)
    return "I'm having trouble connecting you right now. I've sent your number to our team and they'll call you back shortly."
  }

  try {
    const res = await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "transfer",
        destination: { type: "number", number: OWNER_PHONE },
        content: "Please hold while I connect you with someone who can help.",
      }),
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "")
      console.error("[transfer_to_human] control API call failed", { status: res.status, bodyText })
      await logEvent(supabase, "call-transfer-control-FAILED", `status=${res.status} body=${bodyText.slice(0, 200)} caller=${callerPhone}`)
      return "I'm having trouble connecting you right now. I've sent your number to our team and they'll call you back shortly."
    }
  } catch (err) {
    console.error("[transfer_to_human] control API threw", err)
    await logEvent(supabase, "call-transfer-control-FAILED", `${String(err).slice(0, 200)} caller=${callerPhone}`)
    return "I'm having trouble connecting you right now. I've sent your number to our team and they'll call you back shortly."
  }

  return "Please hold while I connect you with someone who can help."
}

async function lookupCallerName(phone: string): Promise<string | null> {
  if (!phone || phone === "unknown") return null
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("phone", normalizePhone(phone))
    .single()
  if (!data) return null
  return [data.first_name, data.last_name].filter(Boolean).join(" ") || null
}

// The end-of-call-report webhook's call object omits startedAt/endedAt in
// practice (despite Vapi's own docs listing them), so duration always came
// through as unknown. Vapi's REST API returns them reliably, so fall back
// to a direct fetch when the webhook didn't include them.
async function fetchVapiCallTimes(callId: string): Promise<{ startedAt?: string; endedAt?: string }> {
  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) return {}
  try {
    const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return {}
    const data = await res.json()
    return { startedAt: data.startedAt, endedAt: data.endedAt }
  } catch {
    return {}
  }
}

async function resolveCallTimes(
  call: Record<string, unknown> | undefined
): Promise<{ startedAt?: string; endedAt?: string; durationSeconds: number | null }> {
  let startedAt = call?.startedAt as string | undefined
  let endedAt = call?.endedAt as string | undefined

  if ((!startedAt || !endedAt) && call?.id) {
    const fetched = await fetchVapiCallTimes(call.id as string)
    startedAt = startedAt ?? fetched.startedAt
    endedAt = endedAt ?? fetched.endedAt
  }

  const durationSeconds = startedAt && endedAt
    ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    : null

  if (durationSeconds === null) {
    console.warn("[voice/webhook] duration unavailable", { callId: call?.id, startedAt, endedAt })
  }

  return { startedAt, endedAt, durationSeconds }
}

async function persistCallLog(
  msg: Record<string, unknown>,
  times: { startedAt?: string; endedAt?: string; durationSeconds: number | null }
): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const call = msg.call as Record<string, unknown> | undefined
    const artifact = msg.artifact as Record<string, unknown> | undefined
    const callerPhone = (call?.customer as Record<string, unknown> | undefined)?.number as string ?? "unknown"
    const callerName = await lookupCallerName(callerPhone)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("call_logs").insert({
      vapi_call_id: call?.id as string ?? null,
      caller_phone: callerPhone !== "unknown" ? normalizePhone(callerPhone) : null,
      caller_name: callerName,
      started_at: times.startedAt ?? null,
      ended_at: times.endedAt ?? null,
      duration_seconds: times.durationSeconds,
      ended_reason: msg.endedReason as string ?? null,
      summary: msg.summary as string ?? null,
      transcript: artifact?.transcript as string ?? null,
      recording_url: artifact?.recordingUrl as string ?? null,
    })

    if (error) {
      console.error("[voice/webhook] call_logs insert error", { callId: call?.id, error })
    }
  } catch (err) {
    console.error("[voice/webhook] failed to persist call log", err)
  }
}

// Vapi's raw recordingUrl requires an authenticated request as of July 2026
// and can't be opened directly from a Telegram notification. Point the
// recap at our own proxy instead, authenticated with a shared secret since
// there's no logged-in admin session when this link gets clicked from Telegram.
function buildRecordingLink(callId?: string): string | null {
  if (!callId) return null
  const secret = process.env.VAPI_RECORDING_LINK_SECRET
  if (!secret) return null
  return `https://tee365.org/api/admin/vapi-recording/${callId}?token=${secret}`
}

async function forwardToN8n(payload: unknown): Promise<void> {
  const url = process.env.N8N_VOICE_WEBHOOK_URL
  if (!url) return
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    // non-blocking
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const msg = body?.message

  if (!msg) {
    return NextResponse.json({ ok: true })
  }

  if (msg.type === "tool-calls") {
    const results: { toolCallId: string; result: string }[] = []
    const callerPhone: string = msg.call?.customer?.number ?? "unknown"

    for (const toolCall of msg.toolCallList ?? []) {
      const name: string = toolCall.function?.name
      const args = parseArgs(toolCall.function?.arguments)
      let result = "Tool not found"

      if (name === "lookup_membership") {
        result = await handleLookupMembership(args.phone || callerPhone)
      } else if (name === "lookup_upcoming_booking") {
        result = await handleLookupUpcomingBooking(args.phone || callerPhone)
      } else if (name === "send_info_sms") {
        result = await handleSendInfoSms(callerPhone)
      } else if (name === "capture_event_lead") {
        result = await handleCaptureEventLead(args, callerPhone)
      } else if (name === "transfer_to_human") {
        result = await handleTransferToHuman(args, callerPhone, msg.call)
      }

      results.push({ toolCallId: toolCall.id, result })
    }

    return NextResponse.json({ results })
  }

  if (msg.type === "end-of-call-report") {
    const callerPhone = msg.call?.customer?.number ?? "unknown"
    const times = await resolveCallTimes(msg.call)
    await persistCallLog(msg, times)
    await forwardToN8n({
      type: "vapi-call-ended",
      callId: msg.call?.id,
      caller: callerPhone,
      callerName: await lookupCallerName(callerPhone),
      durationSeconds: times.durationSeconds,
      summary: msg.summary ?? null,
      transcript: msg.artifact?.transcript ?? null,
      recordingUrl: buildRecordingLink(msg.call?.id),
      endedReason: msg.endedReason ?? null,
    })
  }

  return NextResponse.json({ ok: true })
}
