import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin/guard"
import { banCustomer, unbanCustomer } from "@/lib/admin/ban"

/**
 * Ban or unban a customer. Banning blocks booking on every channel, revokes
 * any door codes they already hold for upcoming sessions, and optionally
 * emails them the notice.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, banned, reason, notify } = await request.json()
  if (!userId || typeof banned !== "boolean") {
    return NextResponse.json({ error: "userId and banned (boolean) are required" }, { status: 400 })
  }

  if (userId === admin.user.id) {
    return NextResponse.json({ error: "You cannot ban yourself." }, { status: 400 })
  }

  if (!banned) {
    const result = await unbanCustomer(admin.serviceClient, { userId, actorId: admin.user.id })
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  const trimmedReason = ((reason as string) || "").trim()
  if (!trimmedReason) {
    return NextResponse.json({ error: "A reason is required to ban someone." }, { status: 400 })
  }

  const result = await banCustomer(admin.serviceClient, {
    userId,
    reason: trimmedReason,
    actorId: admin.user.id,
    notify: notify === true,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
