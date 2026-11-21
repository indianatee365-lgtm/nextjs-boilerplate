import { randomBytes } from "crypto"
import { sendGiftCardEmail } from "@/lib/resend/email"
import { logEvent, logFailure } from "@/lib/observability/notify"

import { BONUS_DAYS, BONUS_EXPIRES, BONUS_RULES_TEXT, BONUS_VALID_FROM, bonusFor, isBonusLive } from "@/lib/promos/holiday-bonus-rules"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Issues the bonus card for a paid gift card, once (keyed on the payment, so
 * a webhook retry finds the existing card and does nothing).
 */
export async function issueHolidayBonusCard(
  db: Db,
  pi: { id: string; created: number },
  card: { amount: number; recipientName: string; recipientEmail: string; senderName: string },
): Promise<void> {
  if (!isBonusLive(new Date(pi.created * 1000))) return
  const bonus = bonusFor(card.amount)
  if (bonus <= 0) return

  const code = randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
  const { error } = await db.from("gift_cards").insert({
    code,
    original_amount: bonus,
    balance: bonus,
    active: true,
    recipient_name: card.recipientName,
    recipient_email: card.recipientEmail,
    purchased_by: `${card.senderName} (Black Friday bonus)`,
    stripe_payment_id: `${pi.id}-bonus`,
    valid_from: BONUS_VALID_FROM.toISOString(),
    expires_at: BONUS_EXPIRES.toISOString(),
    days_allowed: BONUS_DAYS,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") return // already issued
    await logFailure(db, "gift-card-bonus-insert-FAILED", `pi=${pi.id} err=${JSON.stringify(error).slice(0, 200)}`,
      `Black Friday bonus card NOT created for a $${card.amount} gift card to ${card.recipientEmail}. Issue a $${bonus} card by hand.`)
    return
  }
  try {
    await sendGiftCardEmail({
      recipientEmail: card.recipientEmail,
      recipientName: card.recipientName,
      senderName: card.senderName,
      code,
      amount: bonus,
      note: `This is a Black Friday bonus card. ${BONUS_RULES_TEXT}`,
    })
    await logEvent(db, "gift-card-bonus-created", `code=${code} to=${card.recipientEmail} amt=$${bonus} pi=${pi.id}`)
  } catch (e) {
    await logFailure(db, "gift-card-bonus-email-FAILED", `code=${code} to=${card.recipientEmail} err=${String(e).slice(0, 200)}`,
      `Black Friday bonus card ${code} ($${bonus}) was created but the email to ${card.recipientEmail} FAILED. Send it by hand.`)
  }
}
