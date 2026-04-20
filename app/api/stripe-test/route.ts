import { NextResponse } from "next/server"

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return NextResponse.json({ error: "STRIPE_SECRET_KEY not set" })

  try {
    const res = await fetch("https://api.stripe.com/v1/payment_methods?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await res.json()
    return NextResponse.json({ status: res.status, ok: res.ok, keyPrefix: key.slice(0, 12), data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) })
  }
}
