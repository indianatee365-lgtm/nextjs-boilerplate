import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { logFailure } from "@/lib/observability/notify"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { checkoutRatelimit } from "@/lib/ratelimit"
import { findPack, packPriceCents } from "@/lib/hour-packs/packs"

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Hour pack checkout (lib/hour-packs). The price always comes from the pack
// list here, never from the browser.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
    const { success } = await checkoutRatelimit.limit(ip)
    if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 })

    const body = await request.json()
    const pack = findPack(String(body.packId ?? ""))
    if (!pack) return NextResponse.json({ error: "Pick a pack" }, { status: 400 })
    const mode = body.mode === "gift" ? "gift" : "self"
    const senderName = String(body.senderName ?? "").trim()
    if (!senderName) return NextResponse.json({ error: "Your name is required" }, { status: 400 })

    // Signed in and buying for yourself: the hours go straight to your account.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let recipientName: string
    let recipientEmail: string
    let userId: string | undefined
    if (mode === "gift") {
      recipientName = String(body.recipientName ?? "").trim()
      recipientEmail = String(body.recipientEmail ?? "").trim()
      if (!recipientName || !EMAIL_RE.test(recipientEmail)) {
        return NextResponse.json({ error: "Recipient name and a valid email are required" }, { status: 400 })
      }
    } else if (user?.email) {
      userId = user.id
      recipientName = senderName
      recipientEmail = user.email
    } else {
      recipientName = senderName
      recipientEmail = String(body.buyerEmail ?? "").trim()
      if (!EMAIL_RE.test(recipientEmail)) {
        return NextResponse.json({ error: "A valid email is required so we can send your code" }, { status: 400 })
      }
    }

    const amountCents = packPriceCents(pack)
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      payment_method_types: ["card", "cashapp"],
      metadata: {
        type: "hour_pack",
        packId: pack.id,
        mode,
        ...(userId ? { userId } : {}),
        recipientName,
        recipientEmail,
        senderName,
      },
      description: `Tee365 ${pack.hours}-hour pack${mode === "gift" ? ` for ${recipientName}` : ""}`,
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret, credited: Boolean(userId), amountCents })
  } catch (err) {
    try {
      const sc = await createServiceClient()
      await logFailure(sc, "hour-pack-checkout-API-FAILED", `err=${String(err).slice(0, 300)}`,
        `ALERT /api/hour-packs/payment-intent failed, a customer hit Buy and our API errored. Reason: ${String(err).slice(0, 150)}.`)
    } catch { /* best-effort */ }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
