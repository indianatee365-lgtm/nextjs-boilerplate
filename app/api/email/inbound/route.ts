import { NextRequest, NextResponse } from "next/server"

const FORWARD_TO = "indianatee365@gmail.com"

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  if (!process.env.RESEND_INBOUND_SECRET || secret !== process.env.RESEND_INBOUND_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const from = (body.from as string) ?? ""
  const subject = (body.subject as string) ?? "(no subject)"
  const html = (body.html as string) ?? ""
  const text = (body.text as string) ?? ""

  const fromMatch = from.match(/^(.+?)\s*<(.+)>$/)
  const senderName = fromMatch ? fromMatch[1].trim() : from
  const replyTo = fromMatch ? fromMatch[2] : from

  const banner = `<div style="background:#f5f5f5;border-left:3px solid #4ade80;padding:10px 14px;margin-bottom:20px;font-family:sans-serif;font-size:12px;color:#666;">Forwarded to info@tee365.org from: <strong>${from}</strong></div>`

  const forwardHtml = html
    ? `${banner}${html}`
    : `${banner}<p style="font-family:sans-serif;white-space:pre-wrap">${text}</p>`

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${senderName} via Tee365 <info@tee365.org>`,
      to: [FORWARD_TO],
      reply_to: replyTo,
      subject,
      html: forwardHtml,
    }),
  })

  if (!res.ok) {
    console.error("Resend forward failed:", await res.text())
  }

  return NextResponse.json({ ok: true })
}
