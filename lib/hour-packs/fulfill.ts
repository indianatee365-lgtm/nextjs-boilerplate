import { randomBytes } from "crypto"
import { sendFounderMessage } from "@/lib/resend/email"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"
import { findPack, packExpiry } from "@/lib/hour-packs/packs"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Prepaid hour packs (Jerrod, 2026-11-20). Bought on /hour-packs, for
 * yourself or as a gift. They become an hour_credits row, the same ledger
 * free hours use, so bookings spend them automatically.
 * - For yourself while signed in: hours land on your account right away.
 * - Otherwise: a code is emailed (to you, or to the person you're gifting),
 *   redeemed under Free hours on the account page.
 */

function expiryLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Indiana/Indianapolis" })
}

export interface HourPackMeta {
  packId: string
  mode: "self" | "gift"
  userId?: string
  recipientName: string
  recipientEmail: string
  senderName: string
}

/**
 * Turns a paid hour pack into hours, once per payment (hour_credits has a
 * unique stripe_payment_id, so a webhook retry does nothing).
 */
export async function fulfillHourPack(db: Db, pi: { id: string; amount_received: number }, meta: HourPackMeta): Promise<void> {
  const pack = findPack(meta.packId)
  if (!pack) {
    await logFailure(db, "hour-pack-unknown-pack", `pi=${pi.id} pack=${meta.packId}`,
      `ALERT Hour pack payment ${pi.id} has an unknown pack (${meta.packId}). Customer paid, fix by hand.`)
    return
  }
  const expires = packExpiry()
  const credited = meta.mode === "self" && Boolean(meta.userId)
  const code = credited ? null : randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
  const label = `${pack.hours}-hour pack`

  const { error } = await db.from("hour_credits").insert({
    code,
    user_id: credited ? meta.userId : null,
    redeemed_at: credited ? new Date().toISOString() : null,
    hours: pack.hours,
    hours_remaining: pack.hours,
    reason: `${label} (${meta.mode === "gift" ? `gift from ${meta.senderName}` : "purchased"})`,
    expires_at: expires.toISOString(),
    active: true,
    created_by: meta.userId ?? null,
    stripe_payment_id: pi.id,
    amount_paid: pi.amount_received / 100,
    buyer_name: meta.senderName,
    buyer_email: meta.mode === "gift" ? null : meta.recipientEmail,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") return // already fulfilled
    await logFailure(db, "hour-pack-insert-FAILED", `pi=${pi.id} err=${JSON.stringify(error).slice(0, 200)}`,
      `ALERT Hour pack (${label}, $${(pi.amount_received / 100).toFixed(2)}) paid but the hours were NOT created. Customer ${meta.recipientEmail}. Fix by hand.`)
    return
  }

  const useBy = expiryLabel(expires)
  const how = "Sign in (or create a free account) at tee365.org, open your Account page, and enter the code under Free hours. The hours then apply automatically when you book."
  try {
    if (credited) {
      await sendFounderMessage({
        to: meta.recipientEmail, firstName: meta.recipientName,
        subject: `Your ${pack.hours} hours are ready at Tee365`,
        heading: `${pack.hours} hours added to your account`,
        paragraphs: [
          `Thanks for buying a ${label}. The hours are already on your account and apply automatically when you book.`,
          `Use them by ${useBy}.`,
        ],
        ctaText: "Book a bay", ctaUrl: "https://tee365.org/book", kind: "hour-pack",
      })
    } else if (meta.mode === "gift") {
      await sendFounderMessage({
        to: meta.recipientEmail, firstName: meta.recipientName,
        subject: `${meta.senderName} sent you ${pack.hours} hours of golf at Tee365`,
        heading: `${pack.hours} hours of golf, from ${meta.senderName}`,
        paragraphs: [
          `${meta.senderName} gave you ${pack.hours} hours on the golf simulators at Tee365 in Mishawaka.`,
          `Your code: ${code}`,
          how,
          `Good through ${useBy}.`,
        ],
        ctaText: "Redeem your hours", ctaUrl: "https://tee365.org/account", kind: "hour-pack",
      })
    } else {
      await sendFounderMessage({
        to: meta.recipientEmail, firstName: meta.recipientName,
        subject: `Your ${pack.hours}-hour pack code for Tee365`,
        heading: `Your ${pack.hours} hours are ready`,
        paragraphs: [
          `Thanks for buying a ${label}.`,
          `Your code: ${code}`,
          how,
          `Good through ${useBy}.`,
        ],
        ctaText: "Redeem your hours", ctaUrl: "https://tee365.org/account", kind: "hour-pack",
      })
    }
  } catch (e) {
    await logFailure(db, "hour-pack-email-FAILED", `pi=${pi.id} to=${meta.recipientEmail} err=${String(e).slice(0, 200)}`,
      `Hour pack sold but the email to ${meta.recipientEmail} FAILED${code ? ` (code ${code})` : ""}. Send it by hand.`)
  }

  await logEvent(db, "hour-pack-sold", `pi=${pi.id} pack=${pack.id} mode=${meta.mode} to=${meta.recipientEmail}${code ? ` code=${code}` : " credited"}`)
  await notifyOwner(`Hour pack sold: ${label} $${(pi.amount_received / 100).toFixed(2)}, ${meta.mode === "gift" ? `gift from ${meta.senderName} to ${meta.recipientName}` : `for ${meta.recipientName}`}`)
}
