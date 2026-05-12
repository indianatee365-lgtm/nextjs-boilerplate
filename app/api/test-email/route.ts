import { NextResponse } from "next/server"

export async function GET() {
  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 })

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tee365 <bookings@tee365.org>",
      to: ["m20thesailorman@gmail.com"],
      subject: "Tee365 email test",
      html: "<p>Resend is working. You can delete this test email.</p>",
    }),
  })

  const body = await res.json()
  if (!res.ok) return NextResponse.json({ error: body }, { status: 500 })
  return NextResponse.json({ ok: true, id: body.id })
}
