import { NextRequest, NextResponse } from "next/server"
import { sendInfoSms } from "@/lib/telnyx/sms"
import { createServiceClient } from "@/lib/supabase/server"

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

async function persistCallLog(msg: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const call = msg.call as Record<string, unknown> | undefined
    const artifact = msg.artifact as Record<string, unknown> | undefined
    const callerPhone = (call?.customer as Record<string, unknown> | undefined)?.number as string ?? "unknown"
    const callerName = await lookupCallerName(callerPhone)

    const startedAt = call?.startedAt as string | undefined
    const endedAt = call?.endedAt as string | undefined
    const durationSeconds = startedAt && endedAt
      ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("call_logs").insert({
      vapi_call_id: call?.id as string ?? null,
      caller_phone: callerPhone !== "unknown" ? normalizePhone(callerPhone) : null,
      caller_name: callerName,
      started_at: startedAt ?? null,
      ended_at: endedAt ?? null,
      duration_seconds: durationSeconds,
      ended_reason: msg.endedReason as string ?? null,
      summary: msg.summary as string ?? null,
      transcript: artifact?.transcript as string ?? null,
      recording_url: artifact?.recordingUrl as string ?? null,
    })
  } catch (err) {
    console.error("[voice/webhook] failed to persist call log", err)
  }
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

    for (const toolCall of msg.toolCallList ?? []) {
      const name: string = toolCall.function?.name
      const args = parseArgs(toolCall.function?.arguments)
      let result = "Tool not found"

      if (name === "lookup_membership") {
        result = await handleLookupMembership(args.phone || msg.call?.customer?.number || "")
      } else if (name === "lookup_upcoming_booking") {
        result = await handleLookupUpcomingBooking(args.phone || msg.call?.customer?.number || "")
      } else if (name === "send_info_sms") {
        result = await handleSendInfoSms(msg.call?.customer?.number ?? "")
      }

      results.push({ toolCallId: toolCall.id, result })
    }

    return NextResponse.json({ results })
  }

  if (msg.type === "end-of-call-report") {
    const callerPhone = msg.call?.customer?.number ?? "unknown"
    await persistCallLog(msg)
    await forwardToN8n({
      type: "vapi-call-ended",
      callId: msg.call?.id,
      caller: callerPhone,
      callerName: await lookupCallerName(callerPhone),
      durationSeconds: msg.call?.endedAt && msg.call?.startedAt
        ? Math.round((new Date(msg.call.endedAt).getTime() - new Date(msg.call.startedAt).getTime()) / 1000)
        : null,
      summary: msg.summary ?? null,
      transcript: msg.artifact?.transcript ?? null,
      recordingUrl: msg.artifact?.recordingUrl ?? null,
      endedReason: msg.endedReason ?? null,
    })
  }

  return NextResponse.json({ ok: true })
}
