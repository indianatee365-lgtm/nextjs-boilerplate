import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { createBooking } from "@/lib/bookings/create"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const serviceClient = await createServiceClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { bayId, startsAt, durationMinutes, couponCode, giftCardCode, disclosureIds, applyHourCredits } = body

    const result = await createBooking({
      serviceClient,
      userId: user.id,
      bayId,
      startsAt,
      durationMinutes,
      couponCode,
      giftCardCode,
      disclosureIds,
      applyHourCredits,
      source: "web",
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      bookingId: result.bookingId,
      clientSecret: result.clientSecret,
      pricing: result.pricing,
      bay: result.bay,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error"
    console.error("[POST /api/bookings]", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
