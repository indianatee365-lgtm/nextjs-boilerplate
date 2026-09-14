import { NextRequest, NextResponse } from "next/server"
import { logEvent } from "@/lib/observability/notify"
import { requireAdminApi } from "@/lib/admin/guard"

/**
 * Turn the self-service membership restore on or off for one account.
 *
 * The case this exists for is someone removed under the zero-tolerance alcohol
 * policy, which forfeits membership benefits including Founder's Club. Without
 * this they could restore their own membership from /account. Blocking does
 * NOT stop them booking a bay: there is no general ban mechanism yet, and this
 * column is not pretending to be one.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, blocked, reason } = await request.json()
  if (!userId || typeof blocked !== "boolean") {
    return NextResponse.json({ error: "userId and blocked (boolean) are required" }, { status: 400 })
  }

  const { error } = await admin.serviceClient
    .from("profiles")
    .update({
      reinstate_blocked: blocked,
      reinstate_blocked_reason: blocked ? ((reason as string) || null) : null,
    })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: "Could not update this account" }, { status: 500 })

  await logEvent(admin.serviceClient, "reinstate-block-changed",
    `user=${userId} blocked=${blocked} by=${admin.user.id} reason=${blocked ? (reason ?? "none given") : "n/a"}`)

  return NextResponse.json({ ok: true, blocked })
}
