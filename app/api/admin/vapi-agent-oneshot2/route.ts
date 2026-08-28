import { NextRequest, NextResponse } from "next/server"

const VAPI_BASE = "https://api.vapi.ai"

// TEMPORARY one-shot route, 2026-08-28 (second pass): removes bay
// selection from the phone agent entirely - Jerrod: "she's offering bay
// selection, we don't do that." Updates both tool schemas
// (create_phone_booking no longer requires/accepts bay_choice) and the
// PHONE BOOKING prompt section (no longer tells her to wait for the
// caller to pick a bay or confirm one back). Delete after confirming.
const ONESHOT_SECRET = "Qx8vN3mKpZ2wL9tRcB6yF4hJ1sD7gU0e"

const OLD_STEP3 =
  "3. Once they've picked an open bay, collect their first name, last name, and email (needed to text a receipt and set up their account -- ask them to spell it if unclear). Confirm the date, time, duration, and bay back to them."
const NEW_STEP3 =
  "3. Once you've confirmed a time is open, collect their first name, last name, and email (needed to text a receipt and set up their account -- ask them to spell it if unclear). Confirm the date, time, and duration back to them. Never ask which bay or mention a bay number or bay name -- bay assignment is automatic and never discussed with the caller."

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

  // --- Prompt fix ---
  const messages: { role: string; content: string }[] = agent?.model?.messages ?? []
  const sysMsg = messages.find(m => m.role === "system")
  if (!sysMsg) {
    return NextResponse.json({ error: "No system message found" }, { status: 500 })
  }
  const promptFound = sysMsg.content.includes(OLD_STEP3)
  const updatedPrompt = promptFound ? sysMsg.content.replace(OLD_STEP3, NEW_STEP3) : sysMsg.content
  const updatedMessages = messages.map(m => m.role === "system" ? { ...m, content: updatedPrompt } : m)

  // --- Tool schema fix ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = agent?.model?.tools ?? []
  let checkAvailFound = false
  let createBookingFound = false
  const updatedTools = tools.map(t => {
    const name = t?.function?.name
    if (name === "check_availability") {
      checkAvailFound = true
      return {
        ...t,
        function: {
          ...t.function,
          description: "Check whether a bay is open for a specific date, start time, and duration before booking.",
        },
      }
    }
    if (name === "create_phone_booking") {
      createBookingFound = true
      const params = t.function.parameters
      const required = (params.required ?? []).filter((r: string) => r !== "bay_choice")
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { bay_choice, ...restProps } = params.properties ?? {}
      return {
        ...t,
        function: {
          ...t.function,
          description: "Create a reservation for the caller and text them a link to finish payment. Only use after confirming availability with check_availability, and after the caller has agreed to the date and time, and understands a text is coming to complete payment. Bay assignment is automatic - never ask the caller which bay.",
          parameters: { ...params, required, properties: restProps },
        },
      }
    }
    return t
  })

  const changed = promptFound || checkAvailFound || createBookingFound
  if (!changed) {
    return NextResponse.json({ ok: true, changed: false, promptFound, checkAvailFound, createBookingFound })
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

  return NextResponse.json({ ok: true, changed: true, promptFound, checkAvailFound, createBookingFound })
}
