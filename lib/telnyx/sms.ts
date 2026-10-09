import { after } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"
import { doorOpensAt } from "@/lib/access-control/constants"

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
// remember to log it. `kind` identifies which template sent it. `subject`
// is optional extra context for the admin Communications view (mirrors
// email's subject= field there) - e.g. the access code reminder passes the
// actual PIN so it shows up in the "what it is" column, not just "n/a".
async function sendSms(to: string, body: string, kind: string, subject?: string) {
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
  after(() => logEvent(supabase, "sms-sent", `kind=${kind} to=${to}${subject ? ` subject=${subject}` : ""}`))
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
    "✅ Access code sent about 15 min before your session.",
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

// The phone line sends this one. Unlike sendBookingLinkSms above, it is NOT
// tied to a reservation: nothing is held, no bay is named, and there is no
// countdown. It just points the caller at the real tee sheet with what they
// asked for already filled in, so availability comes from the booking page
// rather than from anything the voice agent believed.
export async function sendBookingStartLinkSms({
  to,
  dateLabel,
  durationLabel,
  link,
}: {
  to: string
  dateLabel: string | null
  durationLabel: string | null
  link: string
}) {
  const lines = ["Thanks for calling Tee365! Here is your booking link:"]
  if (dateLabel) {
    lines.push(dateLabel + (durationLabel ? ", " + durationLabel : ""))
  }
  lines.push(
    "Pick your time, then confirm and pay:",
    link,
    "Questions? info@tee365.org",
  )
  await sendSms(to, lines.join("\n"), "booking-start-link")
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

export async function sendFounderMonthlyHoursNotice({
  to,
  firstName,
}: {
  to: string
  firstName: string
}) {
  const message = `Hi ${firstName}, a thank-you for backing Tee365 from day one: starting this month, every founder gets 2 free hours of bay time every month. October's are already in your account. Book at tee365.org/book and they come off automatically. They reset on the 1st, so use October's by the 31st.\n- jerrod`

  await sendSms(to, message, "founder-monthly-hours-notice")
}

export async function sendLeagueTeamConfirmedSms({
  to,
  firstName,
  partnerName,
  teamName,
  teeTime,
  waitlisted,
}: {
  to: string
  firstName: string
  partnerName: string
  teamName: string
  teeTime: string
  waitlisted: boolean
}) {
  const message = waitlisted
    ? `Hi ${firstName}, ${partnerName} accepted. Team ${teamName} is complete and on the Thursday Night League waitlist. We'll text you the moment a spot opens.\n- jerrod`
    : `Hi ${firstName}, ${partnerName} accepted. Team ${teamName} is confirmed for the Thursday Night League, ${teeTime} tee time. Week one is Oct 22.\n- jerrod`

  await sendSms(to, message, "league-team-confirmed")
}

export async function sendLeagueFoundersNotice({ to, firstName }: { to: string; firstName: string }) {
  const message = `Hi ${firstName}, it's Jerrod. Tee365's Thursday Night League starts Oct 22, and as a founder your spot is guaranteed: signup is open to founders only until Monday morning. Two-person teams, 9 holes, A/B match play, $30 a week, 100% of the pot paid out in cash. Details and signup: tee365.org/league\n- jerrod`
  await sendSms(to, message, "league-founders-notice")
}

export async function sendLeagueMembersNotice({ to, firstName }: { to: string; firstName: string }) {
  const message = `Hi ${firstName}, it's Jerrod at Tee365. As a member you get early signup for our Thursday Night League, two days before it opens to everyone. Starts Oct 22: two-person teams, 9 holes, A/B match play, $30 a week, 100% of the pot paid out in cash. tee365.org/league\n- jerrod`
  await sendSms(to, message, "league-members-notice")
}

export async function sendLeaguePublicNotice({ to }: { to: string }) {
  const message = `Tee365: our Thursday Night League is open! Starts Oct 22. Two-person teams, 9 holes on a new course each week, A/B match play with handicaps, $30 a week, 100% of the pot paid out in cash. 16 teams max, signup closes Oct 20: tee365.org/league Reply STOP to opt out`
  await sendSms(to, message, "league-public-notice")
}

export async function sendLeagueChargeFailedSms({ to, firstName, amount }: { to: string; firstName: string; amount: number }) {
  const message = `Hi ${firstName}, your $${amount.toFixed(2)} Thursday Night League charge for tonight didn't go through. Please update your card at tee365.org/account and we'll sort it out. Questions: just reply.\n- Tee365`
  await sendSms(to, message, "league-charge-failed")
}

export async function sendLeagueSpotOpenedSms({ to, firstName, teamName, teeTime }: { to: string; firstName: string; teamName: string; teeTime: string }) {
  const message = `Hi ${firstName}, good news: a spot opened in the Thursday Night League. Team ${teamName} is in at the ${teeTime} tee time. Details: tee365.org/league\n- jerrod`
  await sendSms(to, message, "league-spot-opened")
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
  const fmt = (d: Date) => d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const timeStr = fmt(startsAt)
  // Say when the code starts working. This reminder can reach someone before
  // the door actually unlocks, and a code that silently does not work yet
  // sends a customer to a locked door at an unmanned facility with nobody to
  // ask. Derived from the same constant the door schedule uses.
  const activeFrom = fmt(doorOpensAt(startsAt))

  await sendSms(
    to,
    "Tee365 reminder: " + firstName + ", your session in " + bayName + " starts at " + timeStr + "." +
      "\n\nAccess code: " + accessCode +
      "\nCode becomes active at " + activeFrom + "." +
      "\n\n1️⃣ Tap the keypad to wake it up" +
      "\n2️⃣ Enter your code" +
      "\n3️⃣ Press the checkmark" +
      "\n\nReply STOP to opt out.",
    "access-code-reminder",
    `PIN ${accessCode}`
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

/**
 * The membership is now actually gone: Stripe exhausted its retry window and
 * deleted the subscription. Distinct from the past-due notice above, which is
 * sent while retries are still running and there is still something to save.
 *
 * Founders get a different close. Policy (Jerrod, 2026-09-13): the Founder's
 * Club never ends and a former founder can rejoin once a year at their
 * locked-in price with their original discount, so telling a founder to go
 * buy a new membership at tee365.org/join would be wrong twice over - founder
 * enrollment closed 8/19/26, and the price they would see is not the price
 * they are owed. Reinstating them is a manual admin action
 * (lib/membership/reinstate.ts), so the founder copy asks them to reply.
 */
/**
 * Exported so the admin preview endpoint shows the exact text that will be
 * sent rather than its own second copy of it. A message body that exists twice
 * is a message body that will eventually differ.
 */
export function buildSubscriptionCancelledSmsBody({
  firstName,
  planDisplayName,
  isFounder,
}: {
  firstName: string
  planDisplayName: string
  isFounder: boolean
}): string {
  const opening = `Hi ${firstName}, your Tee365 ${planDisplayName} membership has ended. We weren't able to process the renewal after several attempts, so you won't be charged again.`
  const close = isFounder
    ? `\nYour founder number and your locked-in rate are held for you. Restore it anytime, same rate and no joining fee: tee365.org/account`
    : `\nYou can restore it anytime at your original rate, no joining fee: tee365.org/account`
  return `${opening}${close}\nIf you think the card should have worked, reply here or email info@tee365.org.\nReply STOP to opt out.`
}

export async function sendSubscriptionCancelledSms({
  to,
  firstName,
  planDisplayName,
  isFounder,
}: {
  to: string
  firstName: string
  planDisplayName: string
  isFounder: boolean
}) {
  await sendSms(to, buildSubscriptionCancelledSmsBody({ firstName, planDisplayName, isFounder }), "subscription-cancelled")
}

export async function sendMembershipReinstatedSms({
  to,
  firstName,
  planName,
  priceMonthly,
}: {
  to: string
  firstName: string
  planName: string
  priceMonthly: string
}) {
  await sendSms(
    to,
    `Welcome back ${firstName}! Your Tee365 ${planName} membership is active again at $${priceMonthly}/mo, same rate as before and no joining fee.\nBook anytime: tee365.org/book\nReply STOP to opt out.`,
    "membership-reinstated"
  )
}

export async function sendBookingPaymentFailedSms({
  to,
  firstName,
  bayName,
  startsAt,
  stillConfirmedBayNames,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  /**
   * Bays this customer STILL holds confirmed for the same window. Added
   * 2026-10-04: a customer whose accidental duplicate hold expired received
   * "your payment didn't go through, that slot has been released" for a session
   * he had in fact already booked successfully, could not reconcile the two,
   * and phoned in. The message was accurate but incomplete. Naming what
   * survives also helps the legitimate two-bay case, where knowing WHICH bay
   * is still yours is the useful part.
   */
  stillConfirmedBayNames?: string[]
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
    `Hi ${firstName}, your Tee365 payment for ${bayName} on ${timeStr} didn't go through, so that time slot has been released. No charge was made.` +
      (stillConfirmedBayNames?.length
        ? `\nYour ${stillConfirmedBayNames.join(" and ")} booking for that time is still confirmed.`
        : "") +
      `\nWant to rebook? tee365.org/book\nQuestions? info@tee365.org\nReply STOP to opt out.`,
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
