import { getPricingContext } from "@/lib/pricing/engine"
import { easternWallToUtc } from "@/lib/events"

/**
 * Base price for an event quote: every bay at the normal list rate, with each
 * half hour priced at ITS OWN rate (so 2pm to 8pm is part off-peak, part
 * premium). Regular bookings charge the start time's rate for the whole
 * booking; for a long event this is the fairer number to quote from. No
 * member or veteran discounts: it's the list-price base for a quote.
 */
export interface QuoteLine { from: string; to: string; label: string; rate: number; hours: number; bays: number; amount: number }
export interface Quote { lines: QuoteLine[]; total: number; perBay: number; hours: number; bays: number }

const TZ = "America/Indiana/Indianapolis"
const hm = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "")
const LABEL: Record<string, string> = {
  "on|weekend|premium": "Weekend premium", "on|weekend|non_premium": "Weekend daytime",
  "on|weekday|premium": "Weekday premium", "on|weekday|non_premium": "Weekday daytime",
  "off|weekend|premium": "Off-season weekend premium", "off|weekend|non_premium": "Off-season weekend",
  "off|weekday|premium": "Off-season weekday premium", "off|weekday|non_premium": "Off-season weekday",
}

/** rules: "season|day|time" -> price per hour. Pure, for testing. */
export function quoteFor(rules: Record<string, number>, dateKey: string, startMinutes: number, durationMinutes: number, bays: number): Quote {
  const start = easternWallToUtc(dateKey, startMinutes)
  const lines: QuoteLine[] = []
  for (let t = 0; t < durationMinutes; t += 30) {
    const at = new Date(start.getTime() + t * 60000)
    const c = getPricingContext(at)
    const key = `${c.seasonType}|${c.dayType}|${c.timeType}`
    const rate = rules[key] ?? 0
    const step = Math.min(30, durationMinutes - t) / 60
    const last = lines[lines.length - 1]
    const end = new Date(at.getTime() + step * 3600000)
    if (last && last.rate === rate && LABEL[key] === last.label) { last.hours += step; last.to = hm(end) }
    else lines.push({ from: hm(at), to: hm(end), label: LABEL[key] ?? key, rate, hours: step, bays, amount: 0 })
  }
  for (const l of lines) l.amount = Math.round(l.rate * l.hours * bays * 100) / 100
  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100
  return { lines, total, perBay: bays ? Math.round((total / bays) * 100) / 100 : 0, hours: durationMinutes / 60, bays }
}
