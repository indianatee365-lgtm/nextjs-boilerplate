import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

const VAPI_BASE = "https://api.vapi.ai"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

export async function GET() {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = process.env.VAPI_API_KEY
  const agentId = process.env.VAPI_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "VAPI_API_KEY or VAPI_AGENT_ID not configured" }, { status: 503 })
  }

  const res = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json({ error: `Vapi error: ${body}` }, { status: res.status })
  }

  const agent = await res.json()
  const systemPrompt = agent?.model?.messages?.find(
    (m: { role: string }) => m.role === "system"
  )?.content ?? agent?.model?.systemPrompt ?? ""

  return NextResponse.json({ systemPrompt, agentName: agent?.name ?? "Phone Agent" })
}

export async function PATCH(request: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = process.env.VAPI_API_KEY
  const agentId = process.env.VAPI_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "VAPI_API_KEY or VAPI_AGENT_ID not configured" }, { status: 503 })
  }

  const { systemPrompt } = await request.json()
  if (typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
    return NextResponse.json({ error: "systemPrompt is required" }, { status: 400 })
  }

  // First fetch current agent to preserve all other settings
  const getRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!getRes.ok) {
    return NextResponse.json({ error: "Failed to fetch current agent config" }, { status: 502 })
  }
  const agent = await getRes.json()

  // Update only the system prompt message, preserve everything else
  const messages = (agent?.model?.messages ?? []).map((m: { role: string; content: string }) =>
    m.role === "system" ? { ...m, content: systemPrompt } : m
  )
  if (!messages.find((m: { role: string }) => m.role === "system")) {
    messages.unshift({ role: "system", content: systemPrompt })
  }

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: { ...agent.model, messages } }),
  })

  if (!patchRes.ok) {
    const body = await patchRes.text()
    return NextResponse.json({ error: `Vapi update failed: ${body}` }, { status: patchRes.status })
  }

  return NextResponse.json({ ok: true })
}
