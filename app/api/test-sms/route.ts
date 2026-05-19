import { NextResponse } from "next/server"

export async function GET() {
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.TELNYX_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.TELNYX_PHONE_NUMBER,
      to: "+15749990622",
      text: "Tee365 SMS test",
    }),
  })
  const body = await res.json()
  return NextResponse.json({ status: res.status, body })
}
