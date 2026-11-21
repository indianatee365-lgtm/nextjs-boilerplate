import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { giftCardRatelimit } from "@/lib/ratelimit"

export async function GET(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
  const { success } = await giftCardRatelimit.limit(ip)
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

  const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-")
  if (!code) return NextResponse.json({ error: "Code is required" }, { status: 400 })

  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cardRow } = await (supabase as any)
    .from("gift_cards")
    .select("balance, original_amount, active, expires_at, valid_from, days_allowed")
    .eq("code", code)
    .single()
  const card = cardRow as { balance: number; original_amount: number; active: boolean; expires_at: string | null; valid_from: string | null; days_allowed: number[] | null } | null

  if (!card) return NextResponse.json({ error: "Gift card not found" }, { status: 404 })

  const expired = card.expires_at && new Date(card.expires_at) < new Date()

  return NextResponse.json({
    balance: Number(card.balance),
    originalAmount: Number(card.original_amount),
    active: card.active && !expired,
    expiresAt: card.expires_at,
    validFrom: card.valid_from,
    daysAllowed: card.days_allowed,
  })
}
