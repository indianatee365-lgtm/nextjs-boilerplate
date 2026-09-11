/**
 * Site-wide promotional discounts, managed from /admin/discounts.
 *
 * Replaces hardcoded date windows. The gift card sale used to be a literal
 * `new Date() < new Date("2026-09-01")` check inside the payment-intent route;
 * it expired silently while the marketing copy kept advertising 20% off, so
 * the site promised a discount it no longer gave. Reading both the charge and
 * the storefront copy from this one place is what keeps those in step.
 */

export type DiscountKind = "gift_card" | "booking_hours"

export type PromoDiscount = {
  kind: DiscountKind
  percentOff: number
  active: boolean
  updatedAt: string | null
}

/** A discount only counts when it's switched on AND actually nonzero. */
export function isLive(d: PromoDiscount | null | undefined): boolean {
  return Boolean(d && d.active && d.percentOff > 0)
}

/** Effective percent to apply: 0 when not live, so callers can multiply blindly. */
export function effectivePercent(d: PromoDiscount | null | undefined): number {
  return isLive(d) ? Number(d!.percentOff) : 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDiscount(serviceClient: any, kind: DiscountKind): Promise<PromoDiscount> {
  const fallback: PromoDiscount = { kind, percentOff: 0, active: false, updatedAt: null }
  try {
    const { data } = await serviceClient
      .from("promo_discounts")
      .select("kind, percent_off, active, updated_at")
      .eq("kind", kind)
      .maybeSingle()
    if (!data) return fallback
    return {
      kind,
      percentOff: Number(data.percent_off ?? 0),
      active: Boolean(data.active),
      updatedAt: data.updated_at ?? null,
    }
  } catch {
    // Fail to "no discount" rather than throwing. A lookup blip should never
    // take down checkout, and charging full price is the safe direction to
    // fail: a customer who expected a sale can be refunded the difference,
    // whereas silently underselling every booking cannot be undone.
    return fallback
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAllDiscounts(serviceClient: any): Promise<Record<DiscountKind, PromoDiscount>> {
  const [giftCard, bookingHours] = await Promise.all([
    getDiscount(serviceClient, "gift_card"),
    getDiscount(serviceClient, "booking_hours"),
  ])
  return { gift_card: giftCard, booking_hours: bookingHours }
}
