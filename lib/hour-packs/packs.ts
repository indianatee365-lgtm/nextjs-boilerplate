/**
 * Prepaid hour packs (Jerrod, 2026-11-20). Safe to import in the browser:
 * prices and rules only. Fulfillment lives in ./fulfill.ts.
 */
export const HOUR_PACKS = [
  { id: "5h", hours: 5, priceCents: 15000 },
  { id: "10h", hours: 10, priceCents: 28000 },
] as const
export type HourPackId = (typeof HOUR_PACKS)[number]["id"]
export const HOUR_PACK_VALID_MONTHS = 6

export function findPack(id: string) {
  return HOUR_PACKS.find((p) => p.id === id) ?? null
}

export function packExpiry(from: Date = new Date()): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + HOUR_PACK_VALID_MONTHS)
  return d
}
