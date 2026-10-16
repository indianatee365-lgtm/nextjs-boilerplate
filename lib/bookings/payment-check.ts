// "Is this caller actually paid up?" answered for the owner before a phone
// transfer rings through.
//
// Found live 2026-10-16: a caller told the phone agent he had been "booked and
// charged" but never got a door code. The transfer alert only said "no booking
// found under either phone number provided", and the owner, mid-crisis at his
// day job, let him and two friends in. His card had been declined twice and he
// had paid nothing. So the alert now leads with a verdict.
//
// A paying customer can have no phone number on file (this caller didn't), so a
// phone match alone can't prove someone has NOT paid. The alert therefore also
// lists, by name, who is paid up around now and who recently failed to pay, so
// the owner can find the caller either way.

const TZ = "America/Indiana/Indianapolis"
// Sessions that ended up to an hour ago (caller is mid-session or just left)
// through ones starting in the next three hours (caller is early).
const LOOKBACK_MS = 60 * 60 * 1000
const LOOKAHEAD_MS = 3 * 60 * 60 * 1000
// How far back an unpaid checkout still counts as "just tried to book".
const FAILED_WINDOW_MS = 2 * 60 * 60 * 1000
const MAX_LISTED = 4

export interface PaymentCheckRow {
  id: string
  user_id: string
  status: string
  paid_at: string | null
  source: string | null
  total: number | string | null
  starts_at: string
  ends_at: string
  created_at: string
  bays: { name: string } | null
  profiles: { first_name: string | null; last_name: string | null } | null
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
}

function shortName(r: PaymentCheckRow): string {
  const raw = r.profiles?.first_name?.trim() || "?"
  const first = raw[0].toUpperCase() + raw.slice(1)
  const lastInitial = r.profiles?.last_name?.trim()?.[0]
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first
}

function slot(r: PaymentCheckRow): string {
  return `${r.bays?.name ?? "bay ?"} ${time(r.starts_at)}-${time(r.ends_at)}`
}

/** Pure: turns the rows into the alert text. Split out so it can be checked without a database. */
export function buildPaymentCheck(
  rows: PaymentCheckRow[],
  declinedBookingIds: Set<string>,
  callerUserId: string | null,
  now: Date,
): string {
  const paid = rows.filter((r) => r.status === "confirmed")
  const paidUsers = new Set(paid.map((r) => r.user_id))
  // One line per person, and nobody who got it right on a later try: a
  // customer whose first checkout failed but whose second went through is paid.
  const failedUsers = new Set<string>()
  const failed = rows.filter((r) => {
    if (r.status === "confirmed" || r.paid_at || r.source === "admin") return false
    if (now.getTime() - new Date(r.created_at).getTime() > FAILED_WINDOW_MS) return false
    if (paidUsers.has(r.user_id) || failedUsers.has(r.user_id)) return false
    failedUsers.add(r.user_id)
    return true
  })

  const callerPaid = callerUserId ? paid.find((r) => r.user_id === callerUserId) : undefined
  const lines: string[] = []

  if (callerPaid) {
    const comp = callerPaid.source === "admin" && Number(callerPaid.total ?? 0) === 0 ? " (comp, made by admin)" : ""
    lines.push(`PAID: this caller has ${slot(callerPaid)}${comp}.`)
  } else if (callerUserId) {
    lines.push("NOT PAID: no paid booking on this caller's account. Don't let them in unless you see them below.")
  } else {
    lines.push("NOT PAID: no account has this caller's number. Don't let them in unless you see them below.")
  }

  lines.push(paid.length
    ? `Paid around now: ${paid.slice(0, MAX_LISTED).map((r) => {
        const comp = r.source === "admin" && Number(r.total ?? 0) === 0 ? " comp" : ""
        return `${shortName(r)} ${slot(r)}${comp}`
      }).join("; ")}`
    : "Paid around now: nobody.")

  if (failed.length) {
    lines.push(`Did NOT pay (last 2h): ${failed.slice(0, MAX_LISTED).map((r) =>
      `${shortName(r)} ${slot(r)}, ${declinedBookingIds.has(r.id) ? "card declined" : "never paid"}`).join("; ")}`)
  }

  return lines.join("\n")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/** Never throws: a failed check must not block the transfer itself. */
export async function describeCallerPaymentStatus(
  supabase: SupabaseClient,
  callerUserId: string | null,
  now: Date = new Date(),
): Promise<string> {
  try {
    const [{ data: rows, error }, { data: failures }] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, user_id, status, paid_at, source, total, starts_at, ends_at, created_at, bays(name), profiles!user_id(first_name, last_name)")
        .in("status", ["confirmed", "pending", "cancelled"])
        .gt("ends_at", new Date(now.getTime() - LOOKBACK_MS).toISOString())
        .lt("starts_at", new Date(now.getTime() + LOOKAHEAD_MS).toISOString())
        .order("starts_at", { ascending: true }),
      supabase
        .from("admin_logs")
        .select("detail")
        .eq("event", "booking-payment-FAILED")
        .gt("created_at", new Date(now.getTime() - FAILED_WINDOW_MS).toISOString()),
    ])
    if (error) throw error

    const declined = new Set<string>()
    for (const f of (failures ?? []) as { detail: string | null }[]) {
      const m = f.detail?.match(/booking=([0-9a-f-]{36})/)
      if (m) declined.add(m[1])
    }
    return buildPaymentCheck((rows ?? []) as PaymentCheckRow[], declined, callerUserId, now)
  } catch (e) {
    console.error("[payment-check] failed", e)
    return "PAYMENT CHECK FAILED: look them up in admin before letting anyone in."
  }
}
