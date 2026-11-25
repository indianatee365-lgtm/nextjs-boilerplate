import { isBonusLive } from "@/lib/promos/holiday-bonus-rules"

/**
 * Prepaid hour packs (Jerrod, 2026-11-20). Safe to import in the browser:
 * prices and rules only. Fulfillment lives in ./fulfill.ts.
 *
 * Black Friday prices run during the sale window in
 * lib/promos/holiday-bonus-rules.ts (through Cyber Monday, Nov 30 2026),
 * then the regular price applies automatically.
 */
export const HOUR_PACKS = [
  { id: "5h", hours: 5, priceCents: 17500, salePriceCents: 15000 },
  { id: "10h", hours: 10, priceCents: 32500, salePriceCents: 28000 },
] as const
export type HourPack = (typeof HOUR_PACKS)[number]
export type HourPackId = HourPack["id"]
export const HOUR_PACK_VALID_MONTHS = 6

// Regular winter (on-season) hourly rates from pricing_rules, Nov 2026:
// $35 weekday daytime up to $50 weekend nights. Used to show the savings.
export const REGULAR_RATE_LOW = 35
export const REGULAR_RATE_HIGH = 50

export function packSaleLive(at: Date = new Date()): boolean {
  return isBonusLive(at)
}

/** What the pack costs right now (the server charges this). */
export function packPriceCents(pack: { priceCents: number; salePriceCents: number }, saleLive: boolean = packSaleLive()): number {
  return saleLive ? pack.salePriceCents : pack.priceCents
}

/** Most a pack saves, against the $50 weekend-night rate, in whole dollars. */
export function maxSavings(pack: { hours: number; priceCents: number; salePriceCents: number }, saleLive: boolean = packSaleLive()): number {
  return Math.round(pack.hours * REGULAR_RATE_HIGH - packPriceCents(pack, saleLive) / 100)
}

export function findPack(id: string) {
  return HOUR_PACKS.find((p) => p.id === id) ?? null
}

export function packExpiry(from: Date = new Date()): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + HOUR_PACK_VALID_MONTHS)
  return d
}
