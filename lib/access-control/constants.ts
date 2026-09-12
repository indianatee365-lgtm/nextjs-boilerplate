/**
 * How early the door unlocks, relative to the booked start time.
 *
 * Deliberately in its own dependency-free module. The door schedule
 * (lib/access-control), the reminder SMS (lib/telnyx/sms), the access-code
 * email (lib/resend/email) and the reminder cron all need this number, and
 * none of them should have to import the UniFi client to learn it.
 *
 * Keeping it in one place is the point: on 2026-09-12 the cron sent codes up
 * to 20 minutes ahead while the door only opened at 15, so every customer got
 * a code that did not work yet for up to five minutes, with nothing in the
 * message saying so. Travis Branch was texted code 1191 at 16:10 for a 16:30
 * booking whose door did not unlock until 16:15.
 */
export const DOOR_OPENS_EARLY_MINUTES = 15

/** The moment the code starts working for a given booking. */
export function doorOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - DOOR_OPENS_EARLY_MINUTES * 60 * 1000)
}
