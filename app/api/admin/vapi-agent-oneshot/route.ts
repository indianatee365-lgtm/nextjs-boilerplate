import { NextRequest, NextResponse } from "next/server"

const VAPI_BASE = "https://api.vapi.ai"

// TEMPORARY one-shot route, 2026-08-28: applies a fixed set of exact
// string replacements to the phone agent's system prompt (stale "September
// 2026" opening date and stale Founder's Club / Birdie / Eagle sale-status
// copy, now corrected to match lib/bookings/launch-gate.ts). Hardcoded
// secret + hardcoded replacement list on purpose - not a general-purpose
// endpoint, delete this file once the PATCH is confirmed applied.
const ONESHOT_SECRET = "7frcM2pLoGUpWLx1WJeUDdnc-_4Lc0j2gj5GfrqHKvM"

const REPLACEMENTS: [string, string][] = [
  [
    "- Opening September 2026\n- Bookings are not available until September 2026.",
    "- Public opening day is August 30, 2026\n- Founders (capped membership tier) can book starting Founders Day, August 29\n- Everyone else can book online now for sessions August 30 or later",
  ],
  [
    "-Founder's club is on sale. Exclusive way to lock in LIFETIME pricing and discount. ONLY 100 will be sold. Ever. ",
    "-Founder's Club enrollment CLOSED August 19, 2026 -- it was a one-time opportunity, capped at 100 lifetime memberships, and that window has passed. Birdie and Eagle are open for enrollment now.",
  ],
  [
    "IMPORTANT: Only Founder's Club is on sale right now. Birdie and Eagle are real tiers but are NOT available for purchase yet -- they go on sale in August 2026. If a caller asks whether all three are available today, say clearly that only Founder's Club can be joined right now, and Birdie and Eagle open up in August.",
    "IMPORTANT: Founder's Club enrollment is CLOSED (it closed August 19, 2026 -- capped at 100 members, one-time opportunity, not coming back). Birdie and Eagle are both open for enrollment now. If a caller asks about joining, only Birdie or Eagle are available today.",
  ],
  [
    "Founder's Club -- twenty-nine dollars per month plus a one hundred ninety-nine dollar one-time joining fee, limited to 100 members, ON SALE NOW. Closes August 18 2026",
    "Founder's Club -- twenty-nine dollars per month plus a one hundred ninety-nine dollar one-time joining fee, limited to 100 members. ENROLLMENT CLOSED as of August 19, 2026 -- existing founders keep every benefit below, but this tier can no longer be joined.",
  ],
  [
    "Birdie -- ten dollars per month. NOT on sale yet -- available starting August 2026",
    "Birdie -- ten dollars per month. ON SALE NOW",
  ],
  [
    "Eagle -- thirty-nine dollars per month, most popular. NOT on sale yet -- available starting August 2026",
    "Eagle -- thirty-nine dollars per month, most popular. ON SALE NOW",
  ],
  [
    "Call check_availability to confirm a bay is open at that time. If it says nothing's open at that specific time, ask if they'd like to try a different time. If it says booking isn't available yet at all, that's not a scheduling conflict -- do not offer another time. Apologize, let them know bookings open in September 2026, and offer to text the website (send_info_sms) instead.",
    "Call check_availability to confirm a bay is open at that time. If it says nothing's open at that specific time, ask if they'd like to try a different time. If it says booking isn't available yet at all, that's not a scheduling conflict -- do not offer another time. Relay exactly what the tool told you about when booking opens, and offer to text the website (send_info_sms) as a backup.",
  ],
  [
    "6. If the result says booking isn't available yet, apologize, let them know bookings open in September 2026, and offer to text the website (send_info_sms) instead.",
    "6. If the result says booking isn't available yet, relay exactly what it told you about when booking opens, and offer to text the website (send_info_sms) instead.",
  ],
  [
    "Q: When do you open?\nA: September 2026.",
    "Q: When do you open?\nA: We open to the public August 30, 2026. Founders get early access starting August 29.",
  ],
]

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

  const messages: { role: string; content: string }[] = agent?.model?.messages ?? []
  const sysMsg = messages.find(m => m.role === "system")
  if (!sysMsg) {
    return NextResponse.json({ error: "No system message found" }, { status: 500 })
  }

  let text = sysMsg.content
  const results: { found: boolean; preview: string }[] = []
  for (const [oldStr, newStr] of REPLACEMENTS) {
    const found = text.includes(oldStr)
    if (found) text = text.replace(oldStr, newStr)
    results.push({ found, preview: oldStr.slice(0, 50) })
  }

  if (text === sysMsg.content) {
    return NextResponse.json({ ok: true, changed: false, results })
  }

  const updatedMessages = messages.map(m => m.role === "system" ? { ...m, content: text } : m)

  const patchRes = await fetch(`${VAPI_BASE}/assistant/${agentId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: { ...agent.model, messages: updatedMessages } }),
  })
  if (!patchRes.ok) {
    const body = await patchRes.text()
    return NextResponse.json({ error: `Vapi update failed: ${body}` }, { status: patchRes.status })
  }

  return NextResponse.json({ ok: true, changed: true, results, newLength: text.length })
}
