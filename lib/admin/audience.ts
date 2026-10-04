import { createServiceClient } from "@/lib/supabase/server"
import {
  type AudienceMember,
  type AudienceSegment,
  inSegment,
  isMailable,
} from "./audience-segments"

/**
 * Reading the audience out of the database. The segment definitions, labels
 * and pure helpers live in ./audience-segments so client components can use
 * them; everything there is re-exported here so callers have one import.
 */
export * from "./audience-segments"

export async function getAudience(): Promise<AudienceMember[]> {
  const serviceClient = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  type AuthUser = { id: string; email?: string | null }
  const authUsers: AuthUser[] = []
  const perPage = 1000
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage })
    if (error) break
    const batch = (data?.users ?? []) as AuthUser[]
    authUsers.push(...batch)
    if (batch.length < perPage) break
  }

  const [
    { data: profiles },
    { data: waitlist },
    { data: bookings },
    { data: memberships },
    { data: optOuts },
  ] = await Promise.all([
    db.from("profiles").select("id, first_name, last_name, banned"),
    db.from("waitlist").select("email, first_name, unsubscribed_at"),
    db.from("bookings").select("user_id, starts_at").eq("status", "confirmed"),
    db.from("memberships").select("user_id, plan_type, status").in("status", ["active", "past_due"]),
    db.from("email_opt_outs").select("email"),
  ])

  type ProfileRow = { id: string; first_name: string | null; last_name: string | null; banned: boolean | null }
  type WaitlistRow = { email: string; first_name: string | null; unsubscribed_at: string | null }
  type BookingRow = { user_id: string | null; starts_at: string }
  type MembershipRow = { user_id: string; plan_type: string; status: string }

  const profileById = new Map<string, ProfileRow>()
  for (const p of (profiles ?? []) as ProfileRow[]) profileById.set(p.id, p)

  const bookingStats = new Map<string, { count: number; last: string | null }>()
  for (const b of (bookings ?? []) as BookingRow[]) {
    if (!b.user_id) continue
    const current = bookingStats.get(b.user_id) ?? { count: 0, last: null }
    current.count += 1
    if (!current.last || b.starts_at > current.last) current.last = b.starts_at
    bookingStats.set(b.user_id, current)
  }

  const membershipByUser = new Map<string, MembershipRow>()
  for (const m of (memberships ?? []) as MembershipRow[]) {
    // A founder row wins over any other, since founder status is the one that
    // changes who gets first access.
    const existing = membershipByUser.get(m.user_id)
    if (!existing || m.plan_type === "founder") membershipByUser.set(m.user_id, m)
  }

  const suppressed = new Set<string>(
    ((optOuts ?? []) as { email: string }[]).map((o) => o.email.toLowerCase()),
  )
  for (const w of (waitlist ?? []) as WaitlistRow[]) {
    if (w.unsubscribed_at) suppressed.add(w.email.toLowerCase())
  }

  const byEmail = new Map<string, AudienceMember>()

  for (const user of authUsers) {
    const email = user.email?.trim()
    if (!email) continue
    const key = email.toLowerCase()
    const profile = profileById.get(user.id)
    const stats = bookingStats.get(user.id)
    const membership = membershipByUser.get(user.id)
    byEmail.set(key, {
      email: key,
      displayEmail: email,
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      userId: user.id,
      hasAccount: true,
      onWaitlist: false,
      bookingCount: stats?.count ?? 0,
      lastBookingAt: stats?.last ?? null,
      membershipPlan: membership?.plan_type ?? null,
      isFounder: membership?.plan_type === "founder",
      isMember: Boolean(membership),
      optedOut: suppressed.has(key),
      banned: Boolean(profile?.banned),
    })
  }

  for (const w of (waitlist ?? []) as WaitlistRow[]) {
    const email = w.email?.trim()
    if (!email) continue
    const key = email.toLowerCase()
    const existing = byEmail.get(key)
    if (existing) {
      // Already has an account. Keep the richer account record and just note
      // that they also came in through the waitlist, rather than listing the
      // same human twice.
      existing.onWaitlist = true
      if (!existing.firstName) existing.firstName = w.first_name?.trim() || null
      continue
    }
    byEmail.set(key, {
      email: key,
      displayEmail: email,
      firstName: w.first_name?.trim() || null,
      lastName: null,
      userId: null,
      hasAccount: false,
      onWaitlist: true,
      bookingCount: 0,
      lastBookingAt: null,
      membershipPlan: null,
      isFounder: false,
      isMember: false,
      optedOut: suppressed.has(key),
      banned: false,
    })
  }

  return Array.from(byEmail.values()).sort((a, b) => {
    const an = (a.firstName ?? a.email).toLowerCase()
    const bn = (b.firstName ?? b.email).toLowerCase()
    return an.localeCompare(bn)
  })
}

/** Mailable members of one segment, ready to send to. */
export async function getSegmentRecipients(segment: AudienceSegment): Promise<AudienceMember[]> {
  const audience = await getAudience()
  return audience.filter((m) => isMailable(m) && inSegment(m, segment))
}
