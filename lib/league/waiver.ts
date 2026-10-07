// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Every league player agrees to the same active disclosures a booking does
 * (liability waiver, facility rules, guest and age policy). Stored with the
 * text they agreed to, like a booking's acknowledgement, with no booking id.
 */
export async function recordLeagueWaiver(db: SupabaseClient, userId: string): Promise<void> {
  const { data: disclosures } = await db.from("disclosures").select("id, body").eq("active", true)
  const rows = ((disclosures ?? []) as { id: string; body: string }[]).map((d) => ({
    user_id: userId, disclosure_id: d.id, booking_id: null, body_snapshot: d.body,
  }))
  if (rows.length > 0) {
    await db.from("disclosure_acknowledgments").upsert(rows, { onConflict: "user_id,disclosure_id" })
  }
}
