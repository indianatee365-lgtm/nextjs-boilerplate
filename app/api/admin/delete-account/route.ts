import { NextRequest, NextResponse } from "next/server"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { requireAdminApi } from "@/lib/admin/guard"

/**
 * Delete a customer account. Until now there was no way to do this at all, in
 * the product or the admin, so a deletion request had no answer.
 *
 * Two outcomes, decided by whether the person has any history:
 *
 *   No history   A real delete. auth.users is removed and profiles cascades
 *                with it. Nothing survives. 215 of 339 accounts are in this
 *                state, almost all of them people who signed up and never
 *                booked.
 *
 *   Has history  The profile row has to survive, because bookings.user_id
 *                references it ON DELETE NO ACTION and those rows are the
 *                revenue record behind real charges. Destroying them to satisfy
 *                a deletion request would be trading one problem for a worse
 *                one. So the row stays and every piece of personal data is
 *                stripped out of it, the auth user is banned so they cannot log
 *                in, and their address is released and suppressed.
 *
 * Either way the customer is gone as a person. The difference is whether an
 * anonymous row remains holding up the books.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId } = await request.json()
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }
  if (userId === admin.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin.serviceClient as any

  const { data: profile } = await db
    .from("profiles")
    .select("id, first_name, last_name, role, deleted_at")
    .eq("id", userId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: "No such account" }, { status: 404 })
  if (profile.deleted_at) return NextResponse.json({ error: "Already deleted" }, { status: 400 })
  if (profile.role === "admin") {
    return NextResponse.json({ error: "Remove admin rights before deleting this account" }, { status: 400 })
  }

  // A live booking means a door code is out there and somebody is expecting to
  // play. Deleting underneath that would leave a session nobody can be
  // contacted about, so it is the admin's job to cancel it first and decide
  // about a refund.
  const { data: upcoming } = await db
    .from("bookings")
    .select("id, starts_at")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gt("ends_at", new Date().toISOString())
    .limit(1)

  if ((upcoming ?? []).length > 0) {
    return NextResponse.json({
      error: "This customer has an upcoming booking. Cancel it first, then delete.",
    }, { status: 409 })
  }

  const { data: { user: authUser } } = await admin.serviceClient.auth.admin.getUserById(userId)
  const email = authUser?.email ?? null

  // Anything that would block a real delete, checked explicitly rather than by
  // catching a foreign key error, so the decision is visible in the log.
  const tables: [string, string][] = [
    ["bookings", "user_id"],
    ["memberships", "user_id"],
    ["hour_credits", "user_id"],
    ["coupon_uses", "user_id"],
    ["incidents", "user_id"],
    ["shots", "user_id"],
  ]
  let hasHistory = false
  for (const [table, column] of tables) {
    const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq(column, userId)
    if ((count ?? 0) > 0) { hasHistory = true; break }
  }

  // Never mail a deleted address, whichever path we take.
  if (email) {
    await db.from("email_opt_outs").upsert(
      { email: email.toLowerCase(), source: "account-deleted" },
      { onConflict: "email" },
    )
  }

  if (!hasHistory) {
    const { error } = await admin.serviceClient.auth.admin.deleteUser(userId)
    if (error) {
      await logFailure(admin.serviceClient, "account-delete-FAILED",
        `user=${userId} mode=hard err=${error.message.slice(0, 200)}`)
      return NextResponse.json({ error: "Could not delete this account" }, { status: 500 })
    }
    await logEvent(admin.serviceClient, "account-deleted",
      `user=${userId} mode=hard email=${email ?? "none"} by=${admin.user.id}`)
    return NextResponse.json({ ok: true, mode: "hard" })
  }

  // Anonymise. Order matters: scrub the profile first, so that if the auth
  // update fails we are left with a locked-but-nameless account rather than a
  // named one the customer asked us to remove.
  const { error: profileError } = await db
    .from("profiles")
    .update({
      first_name: "Deleted",
      last_name: "Account",
      phone: null,
      sms_consent: false,
      stripe_customer_id: null,
      veteran_verified_at: null,
      veteran_verified_by: null,
      veteran_verification_source: null,
      deleted_at: new Date().toISOString(),
      deleted_by: admin.user.id,
    })
    .eq("id", userId)

  if (profileError) {
    await logFailure(admin.serviceClient, "account-delete-FAILED",
      `user=${userId} mode=anonymise err=${profileError.message.slice(0, 200)}`)
    return NextResponse.json({ error: "Could not delete this account" }, { status: 500 })
  }

  // Release the real address and lock them out. The tombstone address keeps
  // auth.users unique without holding on to anything identifying, and .invalid
  // is reserved by RFC 2606 so it can never route anywhere real.
  const { error: authError } = await admin.serviceClient.auth.admin.updateUserById(userId, {
    email: `deleted-${userId}@deleted.tee365.invalid`,
    phone: undefined,
    ban_duration: "876000h",
    user_metadata: {},
  })

  if (authError) {
    await logFailure(admin.serviceClient, "account-delete-PARTIAL",
      `user=${userId} profile scrubbed but auth user NOT locked err=${authError.message.slice(0, 200)}`,
      `Account ${userId} was anonymised but the login could not be disabled. Lock it by hand in Supabase.`)
    return NextResponse.json({
      ok: true, mode: "anonymised",
      warning: "Personal data removed, but the login could not be disabled. Check admin logs.",
    })
  }

  await logEvent(admin.serviceClient, "account-deleted",
    `user=${userId} mode=anonymise email=${email ?? "none"} by=${admin.user.id} (booking history retained)`)

  return NextResponse.json({ ok: true, mode: "anonymised" })
}
