import { logFailure } from "@/lib/observability/notify"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export interface ExtensionApplyResult {
  applied: boolean
  addedMinutes: number
  creditHoursUsed: number
  giftCardUsed: number
}

/**
 * Apply an extension to a booking. Every path that applies a customer
 * extension goes through here (finalizeExtend, finalizeFreeExtend, the
 * Stripe webhook backstop).
 *
 * Card only (no hours, no gift card): calls apply_booking_extension exactly
 * as before. With hour credits or a gift card: calls
 * apply_booking_extension_with_credits, which moves ends_at and deducts both
 * in one transaction. Both functions only apply an extension once per end
 * time, so a retry or a finalize/webhook race is a no-op.
 *
 * strict: nothing was charged by card, so if the hours or gift card balance
 * are no longer there, apply nothing (throws). Not strict: the card was
 * already charged for the rest, so apply it anyway and alert on any shortfall.
 */
export async function applyExtension(
  db: SupabaseClient,
  {
    bookingId, newEndsAt, amount, creditHours = 0, giftCardId = null, giftCardApplied = 0, strict,
  }: {
    bookingId: string
    newEndsAt: string
    amount: number
    creditHours?: number
    giftCardId?: string | null
    giftCardApplied?: number
    strict: boolean
  },
): Promise<ExtensionApplyResult> {
  const hours = Number.isFinite(creditHours) && creditHours > 0 ? creditHours : 0
  const gcAmount = giftCardId && Number.isFinite(giftCardApplied) && giftCardApplied > 0 ? giftCardApplied : 0

  if (hours === 0 && gcAmount === 0) {
    const { data, error } = await db.rpc("apply_booking_extension", {
      p_booking_id: bookingId,
      p_new_ends_at: newEndsAt,
      p_amount: amount,
    })
    if (error) throw new Error(error.message)
    const r = (Array.isArray(data) ? data[0] : data) as { applied: boolean; added_minutes: number } | null
    return { applied: Boolean(r?.applied), addedMinutes: r?.added_minutes ?? 0, creditHoursUsed: 0, giftCardUsed: 0 }
  }

  const { data, error } = await db.rpc("apply_booking_extension_with_credits", {
    p_booking_id: bookingId,
    p_new_ends_at: newEndsAt,
    p_amount: amount,
    p_credit_hours: hours,
    p_gift_card_id: gcAmount > 0 ? giftCardId : null,
    p_gift_card_amount: gcAmount,
    p_strict: strict,
  })
  if (error) throw new Error(error.message)
  const r = (Array.isArray(data) ? data[0] : data) as
    { applied: boolean; added_minutes: number; credit_hours_used: number; gift_card_used: number } | null
  const result = {
    applied: Boolean(r?.applied),
    addedMinutes: r?.added_minutes ?? 0,
    creditHoursUsed: Number(r?.credit_hours_used ?? 0),
    giftCardUsed: Number(r?.gift_card_used ?? 0),
  }

  // Card already charged, but the hours or gift card ran short between the
  // price shown and the payment (used elsewhere in the meantime). The
  // customer got their time; Jerrod should know the difference was not covered.
  if (result.applied && (result.creditHoursUsed < hours - 1e-9 || result.giftCardUsed < gcAmount - 0.001)) {
    await logFailure(db, "booking-extend-credits-SHORT",
      `booking=${bookingId} wantedHours=${hours} gotHours=${result.creditHoursUsed} ` +
      `wantedGift=$${gcAmount.toFixed(2)} gotGift=$${result.giftCardUsed.toFixed(2)}`)
  }
  return result
}

/** "1 pack hr + $5.00 gift card" style note for the owner text and log. */
export function describeCovered(creditHoursUsed: number, giftCardUsed: number): string {
  const parts: string[] = []
  if (creditHoursUsed > 0) parts.push(`${creditHoursUsed} pack hr`)
  if (giftCardUsed > 0) parts.push(`$${giftCardUsed.toFixed(2)} gift card`)
  return parts.join(" + ")
}
