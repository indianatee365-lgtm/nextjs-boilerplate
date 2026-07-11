import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const VAPI_BASE = "https://api.vapi.ai"
const CORRECT_SERVER_URL = "https://tee365.org/api/voice/webhook"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

export async function POST() {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = process.env.VAPI_API_KEY
  const agentId = process.env.VAPI_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "VAPI env vars not set" }, { status: 503 })
  }

  const res = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    return NextResponse.json({ error: `VAPI fetch failed: ${await res.text()}` }, { status: 502 })
  }

  const agent = await res.json()
  const currentServerUrl = agent?.serverUrl ?? null
  const phoneServerUrl = agent?.phoneNumber?.serverUrl ?? null

  if (currentServerUrl === CORRECT_SERVER_URL) {
    return NextResponse.json({ ok: true, action: "already_correct", serverUrl: currentServerUrl, phoneServerUrl })
  }

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ serverUrl: CORRECT_SERVER_URL }),
  })
  if (!patchRes.ok) {
    return NextResponse.json({ error: `VAPI patch failed: ${await patchRes.text()}` }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    action: "fixed",
    was: currentServerUrl,
    now: CORRECT_SERVER_URL,
    phoneServerUrl,
  })
}
