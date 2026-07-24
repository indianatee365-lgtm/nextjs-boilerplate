import { NextRequest, NextResponse } from "next/server"

const VAPI_BASE = "https://api.vapi.ai"

// Narrow, cron-only endpoint: refreshes just the "Today's date: ..." line
// in the phone agent's system prompt. Deliberately does NOT accept
// arbitrary prompt content like /api/admin/vapi-agent does - a leaked
// secret here can only ever swap in today's real date, nothing else.
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.VAPI_DATE_REFRESH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

  const messages: { role: string; content: string }[] = agent?.model?.messages ?? []
  const sysMsg = messages.find(m => m.role === "system")
  if (!sysMsg) {
    return NextResponse.json({ error: "No system message found" }, { status: 500 })
  }

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Indiana/Indianapolis",
  })
  const newDateLine = `Today's date: ${todayStr}`

  const dateLineRegex = /Today's date: .+/
  if (!dateLineRegex.test(sysMsg.content)) {
    return NextResponse.json({ error: "Date line not found in prompt - refusing to touch it blind" }, { status: 500 })
  }

  const updatedContent = sysMsg.content.replace(dateLineRegex, newDateLine)
  if (updatedContent === sysMsg.content) {
    return NextResponse.json({ ok: true, changed: false, dateLine: newDateLine })
  }

  const updatedMessages = messages.map(m => m.role === "system" ? { ...m, content: updatedContent } : m)

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: { ...agent.model, messages: updatedMessages } }),
  })
  if (!patchRes.ok) {
    const body = await patchRes.text()
    return NextResponse.json({ error: `Vapi update failed: ${body}` }, { status: patchRes.status })
  }

  return NextResponse.json({ ok: true, changed: true, dateLine: newDateLine })
}
