import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

export async function POST() {
  const sc = await createServiceClient()
  await logEvent(sc, "diagnostic-test-claude", "one-off test of admin_logs insert path")
  return NextResponse.json({ ok: true })
}
