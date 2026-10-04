/**
 * Segment definitions and the pure helpers that go with them.
 *
 * Split out from audience.ts so the admin table, which is a client
 * component, can filter and label rows without dragging the Supabase server
 * client into the browser bundle. Nothing in this file touches the database.
 *
 * One definition of "who can we talk to", shared by the audience page and the
 * email campaign tool.
 *
 * Before this existed the only reachable list was `waitlist`, 53 rows, while
 * 338 people had accounts and 231 of those had never booked. The waitlist was
 * the smallest and least interesting audience we had, and it was the only one
 * with a front door. Everything here is deduped on lowercased email, because
 * the same person routinely exists in both `waitlist` and `auth.users` with
 * different capitalisation.
 *
 * SMS groups live in lib/admin/sms-groups.ts and deliberately stay separate for
 * now: they key on phone and sms_consent rather than email, and they already
 * work. When SMS campaigns move here, that module folds into this one.
 */

export type AudienceSegment =
  | "all"
  | "founders"
  | "members"
  | "never_booked"
  | "one_booking"
  | "repeat"
  | "waitlist_only"

export const SEGMENT_ORDER: AudienceSegment[] = [
  "all",
  "founders",
  "members",
  "never_booked",
  "one_booking",
  "repeat",
  "waitlist_only",
]

export const SEGMENT_LABELS: Record<AudienceSegment, string> = {
  all: "Everyone",
  founders: "Founders",
  members: "Members",
  never_booked: "Never booked",
  one_booking: "Booked once",
  repeat: "Repeat customers",
  waitlist_only: "Waitlist only",
}

export const SEGMENT_DESCRIPTIONS: Record<AudienceSegment, string> = {
  all: "Every mailable address we hold, accounts and waitlist combined.",
  founders: "Active Founders Club members. First access to leagues and anything else that should reward them.",
  members: "Everyone on an active membership, founders included.",
  never_booked: "Made an account and never completed a booking. The largest untapped group we have.",
  one_booking: "Came once and has not been back. The most valuable people to win back.",
  repeat: "Booked more than once. Your regulars.",
  waitlist_only: "Signed up for updates and never created an account.",
}

export function isAudienceSegment(value: string | undefined | null): value is AudienceSegment {
  return typeof value === "string" && (SEGMENT_ORDER as string[]).includes(value)
}

export interface AudienceMember {
  /** Lowercased. The canonical key for dedupe and suppression. */
  email: string
  /** As originally stored, for display only. */
  displayEmail: string
  firstName: string | null
  lastName: string | null
  userId: string | null
  hasAccount: boolean
  onWaitlist: boolean
  bookingCount: number
  lastBookingAt: string | null
  membershipPlan: string | null
  isFounder: boolean
  isMember: boolean
  /** Unsubscribed, bounced, or otherwise suppressed. Never mail these. */
  optedOut: boolean
  banned: boolean
}

/** Whether this person may receive a marketing email. */
export function isMailable(m: AudienceMember): boolean {
  return !m.optedOut && !m.banned && m.email.includes("@")
}

export function inSegment(m: AudienceMember, segment: AudienceSegment): boolean {
  switch (segment) {
    case "all":
      return true
    case "founders":
      return m.isFounder
    case "members":
      return m.isMember
    case "never_booked":
      return m.hasAccount && m.bookingCount === 0
    case "one_booking":
      return m.bookingCount === 1
    case "repeat":
      return m.bookingCount > 1
    case "waitlist_only":
      return m.onWaitlist && !m.hasAccount
  }
}

export function segmentCounts(audience: AudienceMember[]): Record<AudienceSegment, number> {
  const out = {} as Record<AudienceSegment, number>
  for (const segment of SEGMENT_ORDER) {
    out[segment] = audience.filter((m) => inSegment(m, segment) && isMailable(m)).length
  }
  return out
}

/**
 * Build the whole audience in one pass. Everything is small enough (hundreds of
 * rows) that paging would cost more in complexity than it saves in time, but
 * the user listing is looped properly so this does not quietly truncate if the
 * customer base grows past a page.
 */
