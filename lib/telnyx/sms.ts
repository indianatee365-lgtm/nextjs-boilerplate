import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return phone.startsWith("+") ? phone : "+" + phone
}

// Every SMS template funnels through here, so every send - success or
// failure - gets one admin_logs row without relying on each call site to
// remember to log it. `kind` identifies which template sent it.
async function sendSms(to: string, body: string, kind: string) {
  const supabase = await createServiceClient()
  let res: Response
  try {
    res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.TELNYX_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: normalizePhone(process.env.TELNYX_PHONE_NUMBER ?? ""),
        to: normalizePhone(to),
        text: body,
      }),
    })
  } catch (err) {
    await logEvent(supabase, "sms-send-FAILED", `kind=${kind} to=${to} err=${String(err).slice(0, 200)}`)
    throw err
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    await logEvent(supabase, "sms-send-FAILED", `kind=${kind} to=${to} status=${res.status} err=${JSON.stringify(err).slice(0, 200)}`)
    throw new Error("Telnyx SMS failed: " + JSON.stringify(err))
  }

  await logEvent(supabase, "sms-sent", `kind=${kind} to=${to}`)
}

export async function sendBookingConfirmation({
  to,
  firstName,
  bayName,
  startsAt,
  endsAt,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
}) {
  const startStr = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const endStr = endsAt.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  const message = [
    "Hi " + firstName + "! Your Tee365 booking is confirmed.",
    "🕒 " + startStr + " – " + endStr,
    "🏌️ Bay: " + bayName,
    "✅ Access code sent 10–20 min before your session.",
    "Questions? info@tee365.org",
    "Reply STOP to opt out, HELP for info. Msg & data rates may apply.",
  ].join("\n")

  await sendSms(to, message, "booking-confirmation")
}

export async function sendBookingLinkSms({
  to,
  firstName,
  bayName,
  startsAt,
  link,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  link: string
}) {
  const startStr = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  const message = [
    "Hi " + firstName + "! Here's your Tee365 reservation for " + bayName + ":",
    "🕒 " + startStr,
    "Tap to finish and confirm (held for 15 minutes):",
    link,
    "Questions? info@tee365.org",
  ].join("\n")

  await sendSms(to, message, "booking-link")
}

export async function sendAccessCodeReminder({
  to,
  firstName,
  bayName,
  accessCode,
  startsAt,
}: {
  to: string
  firstName: string
  bayName: string
  accessCode: string
  startsAt: Date
}) {
  const timeStr = startsAt.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  await sendSms(
    to,
    "Tee365 reminder: " + firstName + ", your session in " + bayName + " starts at " + timeStr + ".\nAccess code: " + accessCode + "\nReply STOP to opt out.",
    "access-code-reminder"
  )
}
export async function sendInfoSms(to: string) {
  await sendSms(
    normalizePhone(to),
    "Tee365: tee365.org | info@tee365.org | (574) 444-9365\nReply STOP to opt out.",
    "info"
  )
}

export async function sendPaymentRetrySms({
  to,
  firstName,
  planName,
  amount,
}: {
  to: string
  firstName: string
  planName: string
  amount: string
}) {
  await sendSms(
    to,
    `Hi ${firstName}! Your Tee365 ${planName} signup ($${amount}) didn't go through - looks like checkout expired before it finished. No charge was made.\nWant to try again? tee365.org/join\nQuestions? info@tee365.org\nReply STOP to opt out.`,
    "payment-retry"
  )
}

export async function sendBookingPaymentFailedSms({
  to,
  firstName,
  bayName,
  startsAt,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
}) {
  const timeStr = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  await sendSms(
    to,
    `Hi ${firstName}, your Tee365 payment for ${bayName} on ${timeStr} didn't go through, so that time slot has been released. No charge was made.\nWant to rebook? tee365.org/book\nQuestions? info@tee365.org\nReply STOP to opt out.`,
    "booking-payment-failed"
  )
}
