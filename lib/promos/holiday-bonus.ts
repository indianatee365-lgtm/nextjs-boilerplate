import { randomBytes } from "crypto"
import { sendGiftCardEmail } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { BONUS_DAYS, BONUS_EXPIRES, BONUS_RULES_TEXT, BONUS_VALID_FROM, bonusFor, isBonusLive } from "@/lib/promos/holiday-bonus-rules"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Issues the Black Friday bonus card for a paid gift card, once (keyed on the
 * payment, so a webhook retry finds the existing card and does nothing).
 * The buyer chooses who gets it: themselves ("me", the default) or the
 * person they're gifting ("gift"). A payment from before the choice existed,
 * or with no buyer email, sends it with the gift.
 */
export async function issueHolidayBonusCard(
  db: Db,
  pi: { id: string; created: number },
  card: { amount: number; recipientName: string; recipientEmail: string; senderName: string; senderEmail?: string; bonusTo?: string },
): Promise<void> {
  if (!isBonusLive(new Date(pi.created * 1000))) return
  const bonus = bonusFor(card.amount)
  if (bonus <= 0) return

  const toBuyer = card.bonusTo !== "gift" && Boolean(card.senderEmail)
  const toName = toBuyer ? card.senderName : card.recipientName
  const toEmail = toBuyer ? card.senderEmail! : card.recipientEmail

  const code = randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
  const { error } = await db.from("gift_cards").insert({
    code,
    original_amount: bonus,
    balance: bonus,
    active: true,
    recipient_name: toName,
    recipient_email: toEmail,
    purchased_by: toBuyer
      ? `Black Friday bonus (${card.senderName}, kept)`
      : `Black Friday bonus (${card.senderName}, gifted)`,
    stripe_payment_id: `${pi.id}-bonus`,
    valid_from: BONUS_VALID_FROM.toISOString(),
    expires_at: BONUS_EXPIRES.toISOString(),
    days_allowed: BONUS_DAYS,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") return // already issued
    await logFailure(db, "gift-card-bonus-insert-FAILED", `pi=${pi.id} err=${JSON.stringify(error).slice(0, 200)}`,
      `Black Friday bonus card NOT created for a $${card.amount} gift card (bonus for ${toEmail}). Issue a $${bonus} card by hand.`)
    return
  }
  try {
    await sendGiftCardEmail({
      recipientEmail: toEmail,
      recipientName: toName,
      senderName: toBuyer ? "Tee365" : card.senderName,
      code,
      amount: bonus,
      note: toBuyer
        ? `Thanks for buying a gift card. This Black Friday bonus card is yours to keep. ${BONUS_RULES_TEXT}`
        : `This is a Black Friday bonus card that came with your gift. ${BONUS_RULES_TEXT}`,
    })
    await logEvent(db, "gift-card-bonus-created", `code=${code} to=${toEmail} amt=$${bonus} ${toBuyer ? "kept" : "gifted"} pi=${pi.id}`)
  } catch (e) {
    await logFailure(db, "gift-card-bonus-email-FAILED", `code=${code} to=${toEmail} err=${String(e).slice(0, 200)}`,
      `Black Friday bonus card ${code} ($${bonus}) was created but the email to ${toEmail} FAILED. Send it by hand.`)
  }
}
