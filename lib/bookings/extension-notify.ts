import { logEvent, notifyOwner, getAdminSetting, formatDuration } from "@/lib/observability/notify"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Log a paid extension and text Jerrod about it (when notify_extensions is on).
 *
 * Two paths can apply an extension: finalizeExtend, when the customer's
 * phone reports the payment, and the Stripe webhook as a backstop. The
 * apply_booking_extension RPC lets only the first one through. Until
 * 2026-10-08 only finalizeExtend sent this text, and the webhook usually got
 * there first, so not one paid extension (Sep 13, Oct 2, Oct 6) was ever
 * reported. Whichever path the RPC says applied it calls this, so every
 * extension is announced exactly once.
 */
export async function announceExtension(
  db: SupabaseClient,
  {
    bookingId,
    paymentIntentId,
    addedMinutes,
    amount,
    newEndsAt,
    via,
    covered = "",
  }: {
    bookingId: string
    paymentIntentId: string
    addedMinutes: number
    amount: number
    newEndsAt: string
    via: "finalize" | "webhook" | "free"
    // What paid besides the card, e.g. "1 pack hr + $5.00 gift card".
    covered?: string
  },
): Promise<void> {
  await logEvent(db, "booking-extended",
    `booking=${bookingId} pi=${paymentIntentId} addedMinutes=${addedMinutes} ` +
    `amount=$${amount.toFixed(2)} newEndsAt=${newEndsAt} via=${via}` +
    (covered ? ` covered=${covered.replace(/ /g, "_")}` : ""))

  if (!(await getAdminSetting(db, "notify_extensions"))) return

  const { data: booking } = await db
    .from("bookings")
    .select("bays(name), profiles!user_id(first_name, last_name)")
    .eq("id", bookingId)
    .maybeSingle()
  const b = booking as { bays: { name: string } | null; profiles: { first_name: string; last_name: string } | null } | null
  const name = b?.profiles ? `${b.profiles.first_name} ${b.profiles.last_name}` : "A customer"
  const endsLocal = new Date(newEndsAt).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
  })
  await notifyOwner(
    `Session extended: ${name}, ${b?.bays?.name ?? "a bay"}, ` +
    `+${formatDuration(addedMinutes)} ` +
    (covered
      ? (amount > 0 ? `for $${amount.toFixed(2)} card + ${covered}` : `with ${covered}`)
      : `for $${amount.toFixed(2)}`) +
    `. Now ends ${endsLocal}.`,
  )
}
