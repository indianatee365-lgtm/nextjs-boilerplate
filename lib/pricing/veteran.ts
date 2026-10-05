import { VETERAN_DISCOUNT_PERCENT } from "@/lib/pricing/engine"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * The veteran discount a customer is entitled to, as a percentage.
 *
 * One function rather than the lookup being repeated at each of the six places
 * that price a booking, because a discount that applies on the quote but not on
 * the charge (or the other way round) is the kind of bug a customer finds before
 * we do. Returns 0 for a guest, an unverified customer, or any failure: the
 * booking still works, it just does not get the discount, which is the right way
 * round for a pricing error.
 */
export async function getVeteranDiscountPercent(
  db: SupabaseClient,
  userId: string | null | undefined,
): Promise<number> {
  if (!userId) return 0
  try {
    const { data } = await db
      .from("profiles")
      .select("veteran_verified_at")
      .eq("id", userId)
      .maybeSingle()
    return (data as { veteran_verified_at: string | null } | null)?.veteran_verified_at
      ? VETERAN_DISCOUNT_PERCENT
      : 0
  } catch {
    return 0
  }
}
