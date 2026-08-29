import { after } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return phone.startsWith("+") ? phone : "+" + phone
}

// Kinds that must always go through regardless of opt-out status: the
// STOP/START/HELP confirmations ARE the compliance response, a live admin
// reply is a direct 1:1 reply (not a marketing blast), and the inbound
// auto-ack is a direct reply to whatever the person just texted in.
const OPT_OUT_EXEMPT_KINDS = new Set([
  "admin-reply",
  "inbound-auto-ack",
  "opt-out-confirm",
  "opt-in-confirm",
  "help-info",
])

// Every SMS template funnels through here, so every send - success or
// failure - gets one admin_logs row without relying on each call site to
// remember to log it. `kind` identifies which template sent it.
async function sendSms(to: string, body: string, kind: string) {
  const supabase = await createServiceClient()

  if (!OPT_OUT_EXEMPT_KINDS.has(kind)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: optOut } = await (supabase as any)
      .from("sms_opt_outs")
      .select("phone_number")
      .eq("phone_number", normalizePhone(to))
      .maybeSingle()
    if (optOut) {
      await logEvent(supabase, "sms-send-skipped-opted-out", `kind=${kind} to=${to}`)
      return
    }
  }

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

  // Deferred: this is pure observability, doesn't need to hold up the
  // response the admin is waiting on.
  after(() => logEvent(supabase, "sms-sent", `kind=${kind} to=${to}`))
}

// Free-form send for the admin SMS inbox reply box - unlike every other
// export here, the body isn't a fixed template, it's whatever the admin
// typed.
export async function sendAdminReplySms(to: string, body: string) {
  await sendSms(to, body, "admin-reply")
}

// Free-form send for the admin's "new message" compose box - individual or
// as part of a group broadcast.
export async function sendBroadcastSms(to: string, body: string) {
  await sendSms(to, body, "admin-broadcast")
}

export async function sendInboundSmsAutoAck(to: string) {
  const message = [
    "Thanks for texting Tee365! We've got your message and will respond shortly.",
    "For an immediate answer, call this same number to reach our virtual assistant, or email info@tee365.org.",
  ].join(" ")

  await sendSms(to, message, "inbound-auto-ack")
}

export async function sendOptOutConfirmation(to: string) {
  await sendSms(
    to,
    "You've been unsubscribed from Tee365 texts and won't receive further messages. Reply START to resubscribe.",
    "opt-out-confirm"
  )
}

export async function sendOptInConfirmation(to: string) {
  await sendSms(to, "You're resubscribed to Tee365 texts. Reply STOP anytime to opt out again.", "opt-in-confirm")
}

export async function sendHelpSms(to: string) {
  await sendSms(
    to,
    "Tee365: tee365.org | info@tee365.org | (574) 444-9365\nReply STOP to opt out, START to resubscribe. Msg & data rates may apply.",
    "help-info"
  )
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
    "👀 Want to check out our system before you arrive? tee365.org/guide",
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

export async function sendFoundersDayPersonalNotice({
  to,
  firstName,
}: {
  to: string
  firstName: string
}) {
  const message = `Hi ${firstName}, thank you for backing Tee365 from day one. Founders & Friends Day is Saturday, Aug 29, and it's yours. I'll be onsite most of the day, come say hi. Grab your free 2 hours anytime at tee365.org/book, they don't expire so no rush. Anything not working right when you're here, tell us, that's exactly what this day is for.\n- jerrod`

  await sendSms(to, message, "founders-day-personal-notice")
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
    "Tee365 reminder: " + firstName + ", your session in " + bayName + " starts at " + timeStr + "." +
      "\n\nAccess code: " + accessCode +
      "\n\n1️⃣ Tap the keypad to wake it up" +
      "\n2️⃣ Enter your code" +
      "\n3️⃣ Press the checkmark" +
      "\n\nReply STOP to opt out.",
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

export async function sendSubscriptionPastDueSms({
  to,
  firstName,
  planDisplayName,
}: {
  to: string
  firstName: string
  planDisplayName: string
}) {
  await sendSms(
    to,
    `Hi ${firstName}, your Tee365 ${planDisplayName} membership renewal payment didn't go through. Stripe will keep retrying automatically, but please update your card to avoid any interruption: tee365.org/account\nQuestions? info@tee365.org\nReply STOP to opt out.`,
    "subscription-past-due"
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

export async function sendBookingCancellationSms({
  to,
  firstName,
  bayName,
  startsAt,
  endsAt,
  refundAmount,
  creditHoursRestored,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
  refundAmount: number
  creditHoursRestored: number
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

  const lines = [
    "Hi " + firstName + ", your Tee365 booking has been cancelled.",
    "🕒 " + startStr + " – " + endStr,
    "🏌️ Bay: " + bayName,
  ]
  if (refundAmount > 0) lines.push("💳 $" + refundAmount.toFixed(2) + " refunded to your card.")
  if (creditHoursRestored > 0) {
    lines.push("⏱ " + creditHoursRestored + " hour" + (creditHoursRestored === 1 ? "" : "s") + " credit restored to your account.")
  }
  lines.push("Questions? info@tee365.org")
  lines.push("Reply STOP to opt out, HELP for info. Msg & data rates may apply.")

  await sendSms(to, lines.join("\n"), "booking-cancellation")
}

export async function sendBookingRescheduledSms({
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
    "Hi " + firstName + "! Your rescheduled Tee365 booking is confirmed.",
    "🕒 " + startStr + " – " + endStr,
    "🏌️ Bay: " + bayName,
    "Questions? info@tee365.org",
    "Reply STOP to opt out, HELP for info. Msg & data rates may apply.",
  ].join("\n")

  await sendSms(to, message, "booking-rescheduled")
}
