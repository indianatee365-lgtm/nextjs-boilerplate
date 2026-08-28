import { NextRequest, NextResponse } from "next/server"

const VAPI_BASE = "https://api.vapi.ai"
const ONESHOT_SECRET = "9pXqK3mZv7bLR2nT8sQyJhWcE5aFgD1u"

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-oneshot-secret")
  if (!secret || secret !== ONESHOT_SECRET) {
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
  const tools = agent?.model?.tools ?? []
  const relevant = tools.filter((t: { function?: { name?: string } }) =>
    ["check_availability", "create_phone_booking"].includes(t?.function?.name ?? "")
  )

  return NextResponse.json({ tools: relevant })
}
