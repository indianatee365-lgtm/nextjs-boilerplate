import { NextRequest, NextResponse } from "next/server"
import { sendInfoSms, sendBookingLinkSms } from "@/lib/telnyx/sms"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyOwner, logEvent } from "@/lib/observability/notify"
import { createBooking } from "@/lib/bookings/create"
import { isFoundersDaySession, hasFoundersDayCredit } from "@/lib/bookings/launch-gate"

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
  const selfReportedName = args.caller_name?.trim()
  const profileName = await lookupCallerName(callerPhone)
  const displayName = selfReportedName || profileName || "unknown caller"
  const supabase = await createServiceClient()
  const who = `${displayName} (${callerPhone})`

  await Promise.allSettled([
    notifyOwner(`Tee365 call transfer: ${who} - ${reason}. Connecting to you now. If your phone doesn't ring in the next minute, call them back - the transfer may have failed silently.`),
    logEvent(supabase, "call-transfer-initiated", `caller=${callerPhone} name=${displayName} (self-reported=${selfReportedName ?? "none"}, profile=${profileName ?? "none"}) reason=${reason}`),
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

function parseSlotDate(date: string, startTime: string): Date | null {
  const d = new Date(`${date}T${startTime}:00`)
  return isNaN(d.getTime()) ? null : d
}

function validDuration(raw: string): number | null {
  const n = parseInt(raw, 10)
  if (!n || n < 60 || n > 240 || n % 30 !== 0) return null
  return n
}

async function handleCheckAvailability(args: Record<string, string>, callerPhone: string): Promise<string> {
  const startDate = parseSlotDate(args.date, args.start_time)
  const duration = validDuration(args.duration_minutes)
  if (!startDate || !duration) {
    return "I need a valid date, start time, and a duration between 1 and 4 hours in 30-minute increments."
  }
  const endDate = new Date(startDate.getTime() + duration * 60000)

  const supabase = await createServiceClient()

  // Same pre-launch gate as actual booking creation (lib/bookings/create.ts).
  // Without this, the agent checks real bay/booking conflicts, finds none
  // (because nothing can be booked yet), and confidently tells a real caller
  // everything is "open" - which is exactly what happened on a real call
  // 2026-08-01, weeks before the real public opening.
  let isAdmin = false
  let callerId: string | null = null
  if (callerPhone && callerPhone !== "unknown") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("phone", normalizePhone(callerPhone))
      .single()
    if (profile) {
      callerId = profile.id
      isAdmin = profile.role === "admin"
    }
  }

  if (!isAdmin) {
    let eligible = false
    if (callerId && isFoundersDaySession(startDate)) {
      eligible = await hasFoundersDayCredit(supabase, callerId)
    }
    if (!eligible) {
      return "Bookings open in September 2026 - I can't check real-time availability yet. I can text you the website, or take your info so our team can follow up."
    }
  }

  const { data: bays } = await supabase.from("bays").select("id, number, name").eq("active", true).order("number")
  if (!bays || bays.length === 0) {
    return "I'm not able to check availability right now. Let me transfer you to someone who can help."
  }

  const { data: conflicts } = await supabase
    .from("bookings")
    .select("bay_id")
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", endDate.toISOString())
    .gt("ends_at", startDate.toISOString())

  const { data: blocked } = await supabase
    .from("blocked_times")
    .select("bay_id")
    .lt("starts_at", endDate.toISOString())
    .gt("ends_at", startDate.toISOString())

  if ((blocked ?? []).some((b) => b.bay_id === null)) {
    return "We're closed facility-wide during that window. Would you like to try a different time?"
  }

  const busyBayIds = new Set([
    ...(conflicts ?? []).map((c) => c.bay_id),
    ...(blocked ?? []).map((b) => b.bay_id),
  ])
  const openBays = bays.filter((b) => !busyBayIds.has(b.id))

  if (openBays.length === 0) {
    return "Nothing is open at that time. Would you like to try a different time?"
  }
  return `Open at that time: ${openBays.map((b) => b.name).join(", ")}.`
}

async function handleCreatePhoneBooking(args: Record<string, string>, callerPhone: string): Promise<string> {
  const firstName = args.first_name?.trim()
  const lastName = args.last_name?.trim()
  const email = args.email?.trim()
  const bayChoice = args.bay_choice?.trim()
  const startDate = parseSlotDate(args.date, args.start_time)
  const duration = validDuration(args.duration_minutes)

  if (!firstName || !lastName || !email || !bayChoice || !startDate || !duration) {
    return "I'm missing some details - I need your first and last name, an email, which bay, and the date, time, and duration."
  }
  if (!callerPhone || callerPhone === "unknown") {
    return "I wasn't able to get your phone number to text you a booking link. Let me transfer you to someone who can help."
  }

  const supabase = await createServiceClient()
  const normalizedPhone = normalizePhone(callerPhone)

  // Reuse an existing account (so a real member gets their real discount)
  // rather than always creating a new one.
  let userId: string
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", normalizedPhone)
    .single()

  if (existingProfile) {
    userId = existingProfile.id
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      phone: normalizedPhone,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })
    if (createErr || !created?.user) {
      console.error("[create_phone_booking] account creation failed", createErr)
      await logEvent(supabase, "phone-booking-account-FAILED", `caller=${normalizedPhone} err=${String(createErr).slice(0, 200)}`)
      return "I wasn't able to set up your account right now. I'll have our team call you back to finish this."
    }
    userId = created.user.id
    // sms_consent is set true here on the strength of real-time verbal
    // consent on this call - the caller is actively asking to be texted a
    // booking link, same bar the rest of the SMS system uses.
    await supabase.from("profiles").update({
      phone: normalizedPhone,
      first_name: firstName,
      last_name: lastName,
      sms_consent: true,
    }).eq("id", userId)
  }

  const { data: bays } = await supabase.from("bays").select("id, number, name").eq("active", true)
  const bay = (bays ?? []).find((b) =>
    b.name.toLowerCase().includes(bayChoice.toLowerCase()) || String(b.number) === bayChoice
  )
  if (!bay) {
    return `I couldn't match "${bayChoice}" to one of our bays. Can you confirm which bay number?`
  }

  const result = await createBooking({
    serviceClient: supabase,
    userId,
    bayId: bay.id,
    startsAt: startDate.toISOString(),
    durationMinutes: duration,
    source: "phone",
    // Matches the website's own default (hour credits auto-applied unless
    // the customer opts out) - without this, a founder's free Founders Day
    // hours wouldn't actually reduce what they're charged.
    applyHourCredits: true,
  })

  if (!result.ok) {
    if (result.status === 403) {
      return "Bookings open in September 2026 - I can't finalize this yet, but I've got your information and someone will follow up when we open."
    }
    console.error("[create_phone_booking] createBooking failed", result)
    await logEvent(supabase, "phone-booking-create-FAILED", `caller=${normalizedPhone} bay=${bay.name} status=${result.status} err=${result.error}`)
    return "Something went wrong setting up that reservation. I'll have our team follow up with you directly."
  }

  const link = `https://tee365.org/book/complete/${result.bookingId}`
  try {
    await sendBookingLinkSms({ to: normalizedPhone, firstName, bayName: bay.name, startsAt: startDate, link })
  } catch (e) {
    console.error("[create_phone_booking] sms failed", e)
  }

  await Promise.allSettled([
    notifyOwner(`Tee365 phone booking: ${firstName} ${lastName} (${normalizedPhone}) booked ${bay.name} on ${startDate.toLocaleString("en-US", { timeZone: "America/Indiana/Indianapolis" })}. Payment link texted, awaiting completion.`),
    logEvent(supabase, "phone-booking-created", `booking=${result.bookingId} caller=${normalizedPhone} bay=${bay.name}`),
  ])

  return `I've texted you a link to finish your reservation for ${bay.name}. It'll hold for 15 minutes - just tap the link and complete payment to confirm.`
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
      } else if (name === "check_availability") {
        result = await handleCheckAvailability(args, callerPhone)
      } else if (name === "create_phone_booking") {
        result = await handleCreatePhoneBooking(args, callerPhone)
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
