import { requireAdmin } from "@/lib/admin/guard"
import UsersTable, { type UserRow } from "./UsersTable"

export const metadata = { title: "Users | Tee365 Admin" }
export const dynamic = "force-dynamic"

const BUSINESS_TZ = "America/Indiana/Indianapolis"

// Calendar day in Eastern, as YYYY-MM-DD. en-CA because it formats that way
// natively. Never toISOString().split("T") for this: that is UTC, so anything
// after 8pm Eastern lands on the wrong day, which is exactly the bug class that
// keeps biting this codebase.
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const dayKey = (iso: string) => dayFmt.format(new Date(iso))

export default async function AdminUsersPage() {
  const { serviceClient } = await requireAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  const [{ data: profiles }, { data: bookings }] = await Promise.all([
    db
      .from("profiles")
      .select("id, first_name, last_name, phone, role, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    // Confirmed only. A cancelled booking is not a customer who came in, and
    // every segment here is about whether somebody actually used the place.
    db.from("bookings").select("user_id, created_at, status").in("status", ["confirmed", "cancelled"]),
  ])

  type ProfileRow = {
    id: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    role: string | null
    created_at: string
  }
  type BookingRow = { user_id: string | null; created_at: string; status: string }

  // count, and the earliest moment they booked, which is what "joined and
  // booked the same day" turns on.
  const stats = new Map<string, { count: number; cancelled: number; firstBookedAt: string | null }>()
  for (const b of (bookings ?? []) as BookingRow[]) {
    if (!b.user_id) continue
    const prev = stats.get(b.user_id) ?? { count: 0, cancelled: 0, firstBookedAt: null }
    if (b.status === "cancelled") {
      prev.cancelled += 1
    } else {
      prev.count += 1
      if (!prev.firstBookedAt || b.created_at < prev.firstBookedAt) prev.firstBookedAt = b.created_at
    }
    stats.set(b.user_id, prev)
  }

  const thisMonth = dayKey(new Date().toISOString()).slice(0, 7)

  const rows: UserRow[] = ((profiles ?? []) as ProfileRow[]).map((p) => {
    const s = stats.get(p.id)
    const bookingCount = s?.count ?? 0
    return {
      ...p,
      bookingCount,
      cancelledCount: s?.cancelled ?? 0,
      firstBookedAt: s?.firstBookedAt ?? null,
      newThisMonth: dayKey(p.created_at).slice(0, 7) === thisMonth,
      // Signed up and booked on the same Eastern calendar day. Jerrod's
      // hypothesis is that this is most of the customer base: people who make
      // an account only because booking forces them to, then play that day.
      joinedAndBookedSameDay: Boolean(s?.firstBookedAt) && dayKey(p.created_at) === dayKey(s!.firstBookedAt!),
    }
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white mb-6">Users</h1>
      <UsersTable rows={rows} />
    </main>
  )
}
