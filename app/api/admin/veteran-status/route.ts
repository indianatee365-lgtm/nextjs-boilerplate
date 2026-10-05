import { NextRequest, NextResponse } from "next/server"
import { logEvent } from "@/lib/observability/notify"
import { requireAdminApi } from "@/lib/admin/guard"
import { VETERAN_DISCOUNT_PERCENT } from "@/lib/pricing/engine"

/**
 * Grant or remove veteran status on one account, which is worth
 * VETERAN_DISCOUNT_PERCENT off every future booking.
 *
 * Note what this route does NOT accept: any kind of document. The shop is
 * unattended 24/7, so there is no counter where an ID gets looked at and handed
 * back, and a DD-214 carries a full SSN. We store the outcome and who decided
 * it, never the proof. If a customer sends a photo of their discharge papers,
 * the right move is to grant the flag and delete the photo, not to file it.
 *
 * This is the manual route, for people Jerrod knows personally or whose
 * self-serve verification failed. Bulk self-service is GovX ID's job.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, veteran } = await request.json()
  if (!userId || typeof veteran !== "boolean") {
    return NextResponse.json({ error: "userId and veteran (boolean) are required" }, { status: 400 })
  }

  const { error } = await admin.serviceClient
    .from("profiles")
    .update({
      veteran_verified_at: veteran ? new Date().toISOString() : null,
      veteran_verified_by: veteran ? admin.user.id : null,
      veteran_verification_source: veteran ? "admin" : null,
    })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: "Could not update this account" }, { status: 500 })

  await logEvent(admin.serviceClient, "veteran-status-changed",
    `user=${userId} veteran=${veteran} by=${admin.user.id} discount=${VETERAN_DISCOUNT_PERCENT}%`)

  return NextResponse.json({ ok: true, veteran })
}
