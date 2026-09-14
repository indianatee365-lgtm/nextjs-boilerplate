import { NextRequest, NextResponse } from "next/server"
import { reinstateMembership } from "@/lib/membership/reinstate"
import { requireAdminApi } from "@/lib/admin/guard"

/**
 * Put a lapsed member back where they were, at their original price with the
 * founder joining fee waived. Admin-only on purpose: it forgives $199 that a
 * fresh signup would pay, and founder enrollment is closed so there is no
 * self-serve path that could do this correctly.
 *
 * Pass overrideCooldown to reinstate someone who already came back inside the
 * last year - the once-a-year rule is Jerrod's, so Jerrod can waive it.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, overrideCooldown } = await request.json()
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  const result = await reinstateMembership(admin.serviceClient, {
    userId,
    overrideCooldown: overrideCooldown === true,
    actorLabel: `admin:${admin.user.id}`,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
