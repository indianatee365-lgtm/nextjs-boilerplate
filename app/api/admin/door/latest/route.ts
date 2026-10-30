import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin/guard"

export const dynamic = "force-dynamic"

// One-row "has anything changed?" check for the Door Log, polled by
// DoorRefresher while the page is on screen.
export async function GET() {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin.serviceClient as any)
    .from("door_entries")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "lookup failed" }, { status: 500 })

  return NextResponse.json(
    { latest: data?.id ?? "none" },
    { headers: { "Cache-Control": "no-store" } },
  )
}
