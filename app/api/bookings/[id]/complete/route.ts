import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const HOLD_MINUTES = 15

// Unauthenticated by design - the booking's own UUID is the access token,
// same pattern already used by /api/admin/vapi-recording/[callId]. There's
// no session for a caller whose account was created mid-phone-call to check
// against, so this route (like that one) relies on the id being unguessable
// rather than a login.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const serviceClient = await createServiceClient()

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, bay_id, starts_at, ends_at, total, status, stripe_payment_intent_id, created_at, bays(name)")
    .eq("id", id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  if (booking.status === "confirmed") {
    return NextResponse.json({ state: "confirmed" })
  }

  if (booking.status !== "pending") {
    return NextResponse.json({ state: "expired" })
  }

  const ageMinutes = (Date.now() - new Date(booking.created_at).getTime()) / 60000
  if (ageMinutes > HOLD_MINUTES) {
    return NextResponse.json({ state: "expired" })
  }

  let clientSecret: string | null = null
  if (booking.stripe_payment_intent_id) {
    const Stripe = (await import("stripe")).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
    const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
    clientSecret = pi.client_secret
  }

  const { data: disclosures } = await serviceClient
    .from("disclosures")
    .select("id, title, body")
    .eq("active", true)

  const { data: acknowledged } = await serviceClient
    .from("disclosure_acknowledgments")
    .select("disclosure_id")
    .eq("booking_id", booking.id)

  const bay = booking.bays as unknown as { name: string } | null

  return NextResponse.json({
    state: "pending",
    bookingId: booking.id,
    bayName: bay?.name ?? "your bay",
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    total: booking.total,
    clientSecret,
    expiresAt: new Date(new Date(booking.created_at).getTime() + HOLD_MINUTES * 60000).toISOString(),
    disclosures: disclosures ?? [],
    acknowledgedIds: (acknowledged ?? []).map((a) => a.disclosure_id),
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const serviceClient = await createServiceClient()
  const body = await request.json()
  const disclosureIds: string[] = Array.isArray(body?.disclosureIds) ? body.disclosureIds : []

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, status")
    .eq("id", id)
    .single()

  if (!booking || booking.status !== "pending") {
    return NextResponse.json({ error: "not_available" }, { status: 400 })
  }

  if (disclosureIds.length > 0) {
    const { data: disclosureBodies } = await serviceClient
      .from("disclosures").select("id, body").in("id", disclosureIds)
    const bodyMap = Object.fromEntries((disclosureBodies ?? []).map((d) => [d.id, d.body]))
    await serviceClient.from("disclosure_acknowledgments").upsert(
      disclosureIds.map((did) => ({
        user_id: booking.user_id, disclosure_id: did, booking_id: booking.id,
        body_snapshot: bodyMap[did] ?? null,
      })),
      { onConflict: "user_id,disclosure_id" }
    )
  }

  return NextResponse.json({ ok: true })
}
