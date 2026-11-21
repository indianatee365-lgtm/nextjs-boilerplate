/**
 * Black Friday weekend 2026 gift card bonus (Jerrod, 2026-11-20): for every
 * full $100 of gift card bought Nov 27 to Nov 30 (Eastern), the recipient
 * also gets a $20 bonus card, good for sessions Jan 1 to Mar 31 2027,
 * Monday to Thursday only. Full price is charged; the bonus is extra value.
 * Safe to import in the browser. Issuing the card is in ./holiday-bonus.ts.
 */
export const BONUS_START = new Date("2026-11-27T05:00:00Z") // Nov 27, 12:00 AM ET
export const BONUS_END = new Date("2026-12-01T05:00:00Z") // end of Nov 30 ET
export const BONUS_PER_HUNDRED = 20
export const BONUS_VALID_FROM = new Date("2027-01-01T05:00:00Z") // Jan 1 2027, 12:00 AM ET
export const BONUS_EXPIRES = new Date("2027-04-01T04:00:00Z") // end of Mar 31 2027 ET (EDT)
export const BONUS_DAYS = [1, 2, 3, 4] // Mon-Thu, 0 = Sunday
export const BONUS_RULES_TEXT = "Good for sessions Jan 1 to Mar 31, 2027, Monday to Thursday."

export function isBonusLive(at: Date = new Date()): boolean {
  return at >= BONUS_START && at < BONUS_END
}

export function bonusFor(amountDollars: number): number {
  return Math.floor(amountDollars / 100) * BONUS_PER_HUNDRED
}
