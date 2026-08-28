import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const SECRET = "qa-help-overlay-2026-08-28"

export async function POST(req: NextRequest) {
  if (req.headers.get("x-oneshot-secret") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  const { bayId, overrideState } = await req.json()
  const serviceClient = await createServiceClient()
  const { error } = await serviceClient
    .from("bay_agent_status")
    .update({ override_state: overrideState })
    .eq("bay_id", bayId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, bayId, overrideState })
}
