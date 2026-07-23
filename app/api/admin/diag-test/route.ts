import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST() {
  const sc = await createServiceClient()
  const marker = `diag-${Date.now()}`
  const insertRes = await sc.from("admin_logs").insert({ event: "diagnostic-test-claude", detail: marker })
  const selectRes = await sc.from("admin_logs").select("event, detail, created_at").eq("detail", marker).maybeSingle()
  return NextResponse.json({
    marker,
    insertError: insertRes.error,
    insertStatus: insertRes.status,
    selectFound: !!selectRes.data,
    selectError: selectRes.error,
  })
}
