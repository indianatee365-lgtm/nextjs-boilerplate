import { addDaysToDateKey, easternDateKey, easternMidnightUtc } from "@/lib/time/eastern"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * What's already on the calendar, for the date pickers in /admin/events and
 * /admin/tickets: customer bookings, private events, parties and blocked time
 * (league nights, maintenance), by Eastern day.
 */
export interface DaySummary { bookings: number; events: string[]; parties: string[]; blocks: string[] }
export interface DayItem { kind: "booking" | "event" | "party" | "block"; label: string; bays: string; start: string; end: string }

const TZ = "America/Indiana/Indianapolis"
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "")

/** Every Eastern day key an interval touches. */
function daysOf(startIso: string, endIso: string): string[] {
  const out: string[] = []
  let k = easternDateKey(new Date(startIso))
  const last = easternDateKey(new Date(new Date(endIso).getTime() - 1))
  for (let i = 0; i < 400 && k <= last; i++) { out.push(k); k = addDaysToDateKey(k, 1) }
  return out
}

async function rangeData(db: SupabaseClient, from: Date, to: Date) {
  const [bk, ev, pt, bl, bays] = await Promise.all([
    db.from("bookings").select("starts_at, ends_at, bay_id, event_id, profiles!user_id(first_name, last_name)").eq("status", "confirmed")
      .lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
    db.from("events").select("title, starts_at, ends_at, bay_ids").neq("status", "cancelled").lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
    db.from("ticketed_events").select("title, starts_at, ends_at, bay_ids").eq("status", "on").lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
    db.from("blocked_times").select("reason, starts_at, ends_at, bay_id").lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()),
    db.from("bays").select("id, name"),
  ])
  const bayName = new Map(((bays.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]))
  return {
    bookings: (bk.data ?? []) as { starts_at: string; ends_at: string; bay_id: string; event_id: string | null; profiles: { first_name: string; last_name: string } | null }[],
    events: (ev.data ?? []) as { title: string; starts_at: string; ends_at: string; bay_ids: string[] }[],
    parties: (pt.data ?? []) as { title: string; starts_at: string; ends_at: string; bay_ids: string[] }[],
    blocks: (bl.data ?? []) as { reason: string | null; starts_at: string; ends_at: string; bay_id: string | null }[],
    bayName,
  }
}

/** month is "YYYY-MM". */
export async function monthOverview(db: SupabaseClient, month: string): Promise<Record<string, DaySummary>> {
  const first = `${month}-01`
  const [y, m] = month.split("-").map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
  const d = await rangeData(db, easternMidnightUtc(first), easternMidnightUtc(next))
  const out: Record<string, DaySummary> = {}
  const day = (k: string) => (out[k] ??= { bookings: 0, events: [], parties: [], blocks: [] })
  const inMonth = (k: string) => k.startsWith(month)
  for (const b of d.bookings) if (!b.event_id) for (const k of daysOf(b.starts_at, b.ends_at)) if (inMonth(k)) day(k).bookings++
  for (const e of d.events) for (const k of daysOf(e.starts_at, e.ends_at)) if (inMonth(k)) day(k).events.push(e.title)
  for (const p of d.parties) for (const k of daysOf(p.starts_at, p.ends_at)) if (inMonth(k)) day(k).parties.push(p.title)
  for (const b of d.blocks) {
    if ((b.reason ?? "").startsWith("Party: ")) continue // shown as the party itself
    for (const k of daysOf(b.starts_at, b.ends_at)) if (inMonth(k)) { const r = b.reason || "Blocked"; if (!day(k).blocks.includes(r)) day(k).blocks.push(r) }
  }
  return out
}

/** dateKey is "YYYY-MM-DD". Everything on that day, in time order. */
export async function dayDetail(db: SupabaseClient, dateKey: string): Promise<DayItem[]> {
  const d = await rangeData(db, easternMidnightUtc(dateKey), easternMidnightUtc(addDaysToDateKey(dateKey, 1)))
  const names = (ids: (string | null)[]) => ids.map((i) => (i ? d.bayName.get(i) ?? "Bay" : "All bays")).join(", ")
  const items: (DayItem & { t: number })[] = []
  for (const b of d.bookings) if (!b.event_id) items.push({ kind: "booking", label: b.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "Booking", bays: names([b.bay_id]), start: hm(b.starts_at), end: hm(b.ends_at), t: new Date(b.starts_at).getTime() })
  for (const e of d.events) items.push({ kind: "event", label: `Private event: ${e.title}`, bays: names(e.bay_ids), start: hm(e.starts_at), end: hm(e.ends_at), t: new Date(e.starts_at).getTime() })
  for (const p of d.parties) items.push({ kind: "party", label: `Party: ${p.title}`, bays: p.bay_ids.length ? names(p.bay_ids) : "No bays", start: hm(p.starts_at), end: hm(p.ends_at), t: new Date(p.starts_at).getTime() })
  for (const b of d.blocks) if (!(b.reason ?? "").startsWith("Party: ")) items.push({ kind: "block", label: b.reason || "Blocked", bays: names([b.bay_id]), start: hm(b.starts_at), end: hm(b.ends_at), t: new Date(b.starts_at).getTime() })
  return items.sort((a, b) => a.t - b.t).map(({ t: _t, ...rest }) => { void _t; return rest })
}
