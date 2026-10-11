import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { startCheckout } from "@/lib/tickets"

// Public: reserve tickets and open Stripe Checkout. The price and the cap come
// from the database (reserve_ticket_order), never from the request.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = await request.json().catch(() => ({}))
  if (body.ack !== true) return NextResponse.json({ error: "Please tick the box to confirm one ticket per person, any age." }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const res = await startCheckout(db, slug, {
    quantity: Number(body.quantity), name: String(body.name ?? ""), email: String(body.email ?? ""),
    phone: String(body.phone ?? ""), smsOk: Boolean(body.smsOk),
  })
  return "url" in res ? NextResponse.json(res) : NextResponse.json(res, { status: 400 })
}
