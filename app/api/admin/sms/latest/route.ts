import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin/guard"

export const dynamic = "force-dynamic"

/**
 * A one-row "has anything changed?" check for the SMS inbox. The inbox polls
 * this while it is on screen and only re-renders when the answer changes, so
 * an idle inbox costs one tiny query every 15 seconds. Polling a full
 * router.refresh() instead also re-prefetched every admin nav link each time,
 * about a dozen requests per tick.
 */
export async function GET() {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.serviceClient as any)
    .from("sms_messages")
    .select("id, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "lookup failed" }, { status: 500 })

  return NextResponse.json(
    { latest: data ? `${data.id}|${data.created_at}` : "none" },
    { headers: { "Cache-Control": "no-store" } },
  )
}
