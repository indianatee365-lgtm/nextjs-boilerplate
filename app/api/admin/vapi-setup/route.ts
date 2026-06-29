import { NextRequest, NextResponse } from "next/server"

const SETUP_TOKEN = "tee365-vapi-setup-2026-dcce43a"

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${SETUP_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.VAPI_API_KEY
  const agentId = process.env.VAPI_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "VAPI_API_KEY or VAPI_AGENT_ID not configured" }, { status: 503 })
  }

  const BASE = "https://api.vapi.ai"
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }

  const getRes = await fetch(`${BASE}/assistant/${agentId}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!getRes.ok) {
    return NextResponse.json({ error: "Failed to fetch agent: " + await getRes.text() }, { status: 502 })
  }
  const agent = await getRes.json()

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

  const patchRes = await fetch(`${BASE}/assistant/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ model: { ...agent.model, messages: updatedMessages, tools: updatedTools } }),
  })

  if (!patchRes.ok) {
    return NextResponse.json({ error: "Vapi PATCH failed: " + await patchRes.text() }, { status: 502 })
  }

  const toolNames = updatedTools.map(t => t?.function?.name ?? t?.type)
  return NextResponse.json({ ok: true, added, tools: toolNames, promptUpdated: !existingPrompt.includes("EVENTS AND GROUP BOOKINGS") })
}
