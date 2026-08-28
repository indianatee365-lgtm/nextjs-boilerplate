import { NextRequest, NextResponse } from "next/server"

const VAPI_BASE = "https://api.vapi.ai"
const SECRET = "vapi-report-tool-2026-08-28"

export async function POST(request: NextRequest) {
  if (request.headers.get("x-oneshot-secret") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

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

  const currentMessages: { role: string; content: string }[] = agent?.model?.messages ?? []
  const sysMsg = currentMessages.find((m) => m.role === "system")
  const existingPrompt: string = sysMsg?.content ?? ""

  const reportInstructions = `

CUSTOMER REPORTS AND FEEDBACK
If a caller wants to report a problem (broken or dirty equipment, something not working, a complaint) or share any feedback about their experience - even something minor, not just emergencies - take it seriously. Gather:
1. What happened, in their own words
2. Which bay, if they know (optional - don't push if they don't know)

Then call report_issue with that information. After it confirms, thank them warmly and let them know it's been passed along - do not transfer these calls to Jerpod unless they specifically ask to speak to someone directly (Jerrod). If their simulator is acting up right now, first mention the small restart button in the top-right corner of their monitor, then still log the report if they want one on record.`

  const updatedPrompt = existingPrompt.includes("CUSTOMER REPORTS AND FEEDBACK")
    ? existingPrompt
    : existingPrompt + reportInstructions

  const updatedMessages = currentMessages.map((m) =>
    m.role === "system" ? { ...m, content: updatedPrompt } : m
  )
  if (!currentMessages.find((m) => m.role === "system")) {
    updatedMessages.unshift({ role: "system", content: updatedPrompt })
  }

  const existingTools: { type: string; function?: { name: string } }[] = agent?.model?.tools ?? []
  const existingNames = existingTools.map((t) => t?.function?.name ?? t?.type)

  const reportIssueTool = {
    type: "function",
    function: {
      name: "report_issue",
      description:
        "Log a customer report, complaint, or piece of feedback about their Tee365 experience - broken/dirty equipment, something not working, or anything less than perfect. Call this whenever a caller wants to report something or give feedback, even if it's minor.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "What the caller reported, in their own words / as much detail as given" },
          bay: { type: "string", description: "Which bay, if known (e.g. Bay 2). Optional." },
        },
        required: ["description"],
      },
    },
    server: { url: "https://tee365.org/api/voice/webhook" },
  }

  const updatedTools = [...existingTools]
  const added: string[] = []
  if (!existingNames.includes("report_issue")) {
    updatedTools.push(reportIssueTool)
    added.push("report_issue")
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

  const toolNames = updatedTools.map((t) => t?.function?.name ?? t?.type)
  return NextResponse.json({
    ok: true,
    added,
    tools: toolNames,
    promptUpdated: !existingPrompt.includes("CUSTOMER REPORTS AND FEEDBACK"),
  })
}
