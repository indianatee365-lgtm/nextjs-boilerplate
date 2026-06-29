import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

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

  const getRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!getRes.ok) {
    return NextResponse.json({ error: "Failed to fetch current agent config" }, { status: 502 })
  }
  const agent = await getRes.json()

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

// One-shot: add event tools + update system prompt. Hit once, then done.
export async function POST() {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = process.env.VAPI_API_KEY
  const agentId = process.env.VAPI_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "VAPI_API_KEY or VAPI_AGENT_ID not configured" }, { status: 503 })
  }

  const getRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!getRes.ok) {
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 502 })
  }
  const agent = await getRes.json()

  // System prompt
  const currentMessages: { role: string; content: string }[] = agent?.model?.messages ?? []
  const sysMsg = currentMessages.find(m => m.role === "system")
  const existingPrompt: string = sysMsg?.content ?? ""

  const eventInstructions = `

EVENTS AND GROUP BOOKINGS
When a caller asks about private events, group bookings, parties, corporate events, birthday parties, bachelor/bachelorette parties, or any group outing at Tee365, collect the following before transferring:
1. Their name
2. The type of event (be specific: bachelor party, corporate outing, birthday, etc.)
3. The approximate date or time frame they have in mind
4. The best callback phone number (default to the number they are calling from if they do not specify)

Once you have all four pieces, call capture_event_lead. After it confirms, immediately use transferCall to transfer the call. Keep it conversational and brief.`

  const updatedPrompt = existingPrompt.includes("EVENTS AND GROUP BOOKINGS")
    ? existingPrompt
    : existingPrompt + eventInstructions

  const updatedMessages = currentMessages.map(m =>
    m.role === "system" ? { ...m, content: updatedPrompt } : m
  )
  if (!currentMessages.find(m => m.role === "system")) {
    updatedMessages.unshift({ role: "system", content: updatedPrompt })
  }

  // Tools
  const existingTools: { type: string; function?: { name: string } }[] = agent?.model?.tools ?? []
  const existingNames = existingTools.map(t => t?.function?.name ?? t?.type)

  const captureEventLeadTool = {
    type: "function",
    function: {
      name: "capture_event_lead",
      description: "Collect event inquiry details from a caller interested in private events, group bookings, bachelor/bachelorette parties, corporate events, or birthday parties. Call this after collecting name, event type, event date, and phone number.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Caller's full name" },
          event_type: { type: "string", description: "Type of event (e.g. bachelor party, corporate outing, birthday party, group outing)" },
          event_date: { type: "string", description: "Approximate date or time frame (e.g. July 4th, sometime in October, this summer)" },
          phone: { type: "string", description: "Best callback phone number. Defaults to caller's number if not specified." },
        },
        required: ["name", "event_type", "event_date"],
      },
    },
    server: { url: "https://tee365.org/api/voice/webhook" },
  }

  const transferCallTool = {
    type: "transferCall",
    function: {
      name: "transferCall",
      description: "Transfer the call to Jerrod. Use this immediately after capture_event_lead confirms.",
    },
    destinations: [
      {
        type: "number",
        number: "+15749990622",
        message: "One moment, connecting you now.",
      },
    ],
  }

  const updatedTools = [...existingTools]
  const added: string[] = []
  if (!existingNames.includes("capture_event_lead")) {
    updatedTools.push(captureEventLeadTool)
    added.push("capture_event_lead")
  }
  if (!existingNames.includes("transferCall")) {
    updatedTools.push(transferCallTool)
    added.push("transferCall")
  }

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: { ...agent.model, messages: updatedMessages, tools: updatedTools } }),
  })

  if (!patchRes.ok) {
    const body = await patchRes.text()
    return NextResponse.json({ error: `Vapi update failed: ${body}` }, { status: patchRes.status })
  }

  const toolNames = updatedTools.map(t => t?.function?.name ?? t?.type)
  return NextResponse.json({ ok: true, added, tools: toolNames, promptUpdated: !existingPrompt.includes("EVENTS AND GROUP BOOKINGS") })
}
