import type { Contact } from "@/app/(admin)/admin/sms/new/RecipientPicker"

const BOOKING_TIMEZONE = "America/Indiana/Indianapolis"

// Everyone we hold a number for, for the name lookup on /admin/sms/new.
// Deliberately NOT filtered by SMS consent the way a group blast is: an
// individual admin message is usually about a session someone is sitting in
// right now, and cutting those people out of the search would send you back to
// looking the number up by hand. They're flagged instead, so it's a visible
// choice rather than a silent one.
//
// Anyone with a session today is labeled with their bay and start time, which
// is what actually tells two Tylers apart when you're in a hurry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSmsContacts(serviceClient: any): Promise<Contact[]> {
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const [{ data: profiles }, { data: todaysBookings }] = await Promise.all([
    serviceClient
      .from("profiles")
      .select("id, first_name, last_name, phone, sms_consent")
      .not("phone", "is", null)
      .order("first_name"),
    serviceClient
      .from("bookings")
      .select("user_id, starts_at, bays(number)")
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .in("status", ["confirmed", "pending"])
      .order("starts_at"),
  ])

  // First session of the day per person is enough of a hint to identify them.
  const todayByUser = new Map<string, string>()
  for (const b of (todaysBookings ?? []) as Array<{
    user_id: string | null; starts_at: string; bays: { number: number } | null
  }>) {
    if (!b.user_id || todayByUser.has(b.user_id)) continue
    const time = new Date(b.starts_at).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: BOOKING_TIMEZONE,
    })
    todayByUser.set(b.user_id, b.bays ? `Bay ${b.bays.number} · ${time}` : `Today · ${time}`)
  }

  const contacts: Contact[] = []
  const seenPhones = new Set<string>()

  for (const p of (profiles ?? []) as Array<{
    id: string; first_name: string | null; last_name: string | null
    phone: string | null; sms_consent: boolean | null
  }>) {
    const phone = p.phone?.trim()
    if (!phone) continue
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
    if (!name) continue
    // Duplicate accounts on one number are a real thing here (see the two
    // Jeremy Bonk accounts, 2026-09-11). Texting a number twice from one menu
    // entry is confusing, so the first account for a number wins.
    const key = phone.replace(/\D/g, "").slice(-10)
    if (seenPhones.has(key)) continue
    seenPhones.add(key)

    contacts.push({
      name,
      phone,
      ...(todayByUser.has(p.id) ? { today: todayByUser.get(p.id) } : {}),
      ...(p.sms_consent === true ? {} : { optedOut: true }),
    })
  }

  // People in a bay today float to the top, since that's who a message at a
  // keyboard in the middle of a shift is usually for.
  return contacts.sort((a, b) => {
    if (!!a.today !== !!b.today) return a.today ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
