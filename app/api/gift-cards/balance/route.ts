import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { giftCardAj } from "@/lib/arcjet"

export async function GET(request: NextRequest) {
  const decision = await giftCardAj.protect(request)
  if (decision.isDenied()) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-")
  if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 })

  const supabase = await createServiceClient()
  const { data: card } = await supabase
    .from("gift_cards")
    .select("balance, original_amount, active, expires_at")
    .eq("code", code)
    .single()

  if (!card) return NextResponse.json({ error: "Gift card not found" }, { status: 404 })

  const expired = card.expires_at && new Date(card.expires_at) < new Date()

  return NextResponse.json({
    balance: Number(card.balance),
    originalAmount: Number(card.original_amount),
    active: card.active && !expired,
    expiresAt: card.expires_at,
  })
}
