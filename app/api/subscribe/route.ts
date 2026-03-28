import { NextRequest, NextResponse } from "next/server"

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    }).toString(),
  })

  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status}`)
  }

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`No access_token in Zoho response: ${JSON.stringify(data)}`)
  }

  return data.access_token
}

export async function POST(req: NextRequest) {
  const { email, firstName } = await req.json()

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const listKey = process.env.ZOHO_LIST_KEY
  if (!listKey || !process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    console.error("[subscribe] Token error:", err)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }

  const contactInfo: Record<string, string> = { "Contact Email": email }
  if (firstName && typeof firstName === "string") {
    contactInfo["First Name"] = firstName
  }

  const params = new URLSearchParams({
    listkey: listKey,
    resfmt: "JSON",
    contactinfo: JSON.stringify(contactInfo),
  })

  const res = await fetch("https://campaigns.zoho.com/api/v1.1/json/listsubscribe", {
    method: "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  const responseText = await res.text()

  if (!res.ok) {
    return NextResponse.json({ error: "Subscription failed" }, { status: 502 })
  }

  // Zoho returns HTTP 200 even for logical errors — check the response body
  let responseData: { code?: string | number; status?: string; message?: string }
  try {
    responseData = JSON.parse(responseText)
  } catch {
    return NextResponse.json({ error: "Unexpected response from Zoho" }, { status: 502 })
  }

  if (String(responseData.code) !== "0") {
    console.error("[subscribe] Zoho logical error:", responseData)
    return NextResponse.json({ error: responseData.message ?? "Subscription failed" }, { status: 422 })
  }

  return NextResponse.json({ success: true })
}
