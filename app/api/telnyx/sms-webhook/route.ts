import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyTelnyxSignature } from "@/lib/telnyx/verify-webhook"
import { sendInboundSmsAutoAck, sendOptOutConfirmation, sendOptInConfirmation, sendHelpSms } from "@/lib/telnyx/sms"
import { sendSmsOptOutConfirmationEmail } from "@/lib/resend/email"
import { notifyOwner, logEvent, logFailure } from "@/lib/observability/notify"

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return raw.startsWith("+") ? raw : "+" + raw
}

// CTIA standard opt-out/opt-in/help keywords, matched against the whole
// trimmed message (not a substring) so a real sentence that happens to
// contain "stop" doesn't trigger this.
const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])
const START_KEYWORDS = new Set(["START", "UNSTOP", "YES"])
const HELP_KEYWORDS = new Set(["HELP", "INFO"])

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get("telnyx-signature-ed25519")
  const timestamp = request.headers.get("telnyx-timestamp")

  if (!verifyTelnyxSignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  const event = JSON.parse(rawBody)
  const eventType = event?.data?.event_type

  // This webhook URL receives every messaging event on the profile (delivery
  // receipts, message.sent, etc.), not just inbound texts - only act on
  // message.received, acknowledge everything else without doing anything.
  if (eventType !== "message.received") {
    return NextResponse.json({ ok: true })
  }

  const payload = event.data.payload
  const fromNumber = payload?.from?.phone_number as string | undefined
  const text = payload?.text as string | undefined
  const telnyxMessageId = payload?.id as string | undefined

  if (!fromNumber || !text) {
    return NextResponse.json({ ok: true })
  }

  const phone = normalizePhone(fromNumber)
  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Checked before inserting this message, so it reflects whether this phone
  // has ever texted (or been texted) before now - used to only auto-ack the
  // start of a conversation, not every message in one already underway.
  const { count: priorMessageCount } = await db
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .eq("phone_number", phone)
  const isNewConversation = (priorMessageCount ?? 0) === 0

  const { error: insertErr } = await db.from("sms_messages").insert({
    phone_number: phone,
    direction: "inbound",
    body: text,
    telnyx_message_id: telnyxMessageId ?? null,
  })
  if (insertErr) {
    console.error("[telnyx/sms-webhook] failed to log inbound message", insertErr)
  }

  const keyword = text.trim().toUpperCase()

  // STOP/START/HELP are routine, expected interactions - logged for the
  // dashboard but not worth an owner SMS alert the way a real question is.
  if (STOP_KEYWORDS.has(keyword)) {
    await db.from("sms_opt_outs").upsert({ phone_number: phone })
    // .select() here so we get email/first_name back from the same round
    // trip, instead of a separate lookup, to email them that access codes
    // and booking texts will stop and where to find them instead.
    const { data: updatedProfiles } = await db
      .from("profiles")
      .update({ sms_consent: false })
      .eq("phone", phone)
      .select("email, first_name")
    await logEvent(supabase, "sms-opt-out", `from=${phone}`)
    try {
      await sendOptOutConfirmation(phone)
      await db.from("sms_messages").insert({
        phone_number: phone,
        direction: "outbound",
        body: "[opt-out] You've been unsubscribed from Tee365 texts and won't receive further messages. Reply START to resubscribe.",
      })
    } catch (err) {
      await logFailure(supabase, "sms-opt-out-confirm-FAILED", `to=${phone} err=${String(err).slice(0, 200)}`)
    }

    const optedOutProfile = updatedProfiles?.[0] as { email: string | null; first_name: string | null } | undefined
    if (optedOutProfile?.email) {
      try {
        await sendSmsOptOutConfirmationEmail({ to: optedOutProfile.email, firstName: optedOutProfile.first_name ?? "there" })
      } catch (err) {
        await logFailure(supabase, "sms-opt-out-email-FAILED", `to=${optedOutProfile.email} err=${String(err).slice(0, 200)}`)
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (START_KEYWORDS.has(keyword)) {
    await db.from("sms_opt_outs").delete().eq("phone_number", phone)
    await db.from("profiles").update({ sms_consent: true }).eq("phone", phone)
    await logEvent(supabase, "sms-opt-in", `from=${phone}`)
    try {
      await sendOptInConfirmation(phone)
      await db.from("sms_messages").insert({
        phone_number: phone,
        direction: "outbound",
        body: "[opt-in] You're resubscribed to Tee365 texts. Reply STOP anytime to opt out again.",
      })
    } catch (err) {
      await logFailure(supabase, "sms-opt-in-confirm-FAILED", `to=${phone} err=${String(err).slice(0, 200)}`)
    }
    return NextResponse.json({ ok: true })
  }

  if (HELP_KEYWORDS.has(keyword)) {
    await logEvent(supabase, "sms-help-requested", `from=${phone}`)
    try {
      await sendHelpSms(phone)
      await db.from("sms_messages").insert({
        phone_number: phone,
        direction: "outbound",
        body: "[help] Tee365: tee365.org | info@tee365.org | (574) 444-9365. Reply STOP to opt out, START to resubscribe.",
      })
    } catch (err) {
      await logFailure(supabase, "sms-help-send-FAILED", `to=${phone} err=${String(err).slice(0, 200)}`)
    }
    return NextResponse.json({ ok: true })
  }

  // Alert fires with the actual message content, not just "someone texted" -
  // the link jumps straight into that conversation instead of making Jerrod
  // hunt for it in the inbox list.
  const conversationUrl = `https://tee365.org/admin/sms?phone=${encodeURIComponent(phone)}`
  await Promise.allSettled([
    notifyOwner(`Tee365 SMS from ${phone}: "${text.slice(0, 300)}"\n${conversationUrl}`),
    logEvent(supabase, "inbound-sms-received", `from=${phone} text=${text.slice(0, 100)}`),
  ])

  // Only auto-ack the start of a brand new conversation - if this phone has
  // texted before (or already gotten a reply), a repeat "we got your text,
  // will respond shortly" reads as spam rather than a helpful first reply.
  if (isNewConversation) {
    try {
      await sendInboundSmsAutoAck(phone)
      await db.from("sms_messages").insert({
        phone_number: phone,
        direction: "outbound",
        body: "[auto-ack] Thanks for texting Tee365! We've got your message and will respond shortly. For an immediate answer, call this same number to reach our virtual assistant, or email info@tee365.org.",
      })
    } catch (err) {
      await logFailure(supabase, "inbound-sms-autoack-FAILED", `to=${phone} err=${String(err).slice(0, 200)}`)
    }
  }

  return NextResponse.json({ ok: true })
}
