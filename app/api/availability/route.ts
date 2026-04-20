import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateDaySlots, getPricingContext } from "@/lib/pricing/engine"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get("date")
  const bayId = searchParams.get("bayId")

  if (!dateStr) {
    return NextResponse.json({ error: "date is required" }, { status: 400 })
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 })
  }

  const supabase = await createClient()

  // Build date range for the query
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  // Get all active bays
  const { data: bays } = await supabase
    .from("bays")
    .select("id, number, name")
    .eq("active", true)
    .order("number")

  if (!bays) return NextResponse.json({ error: "failed to load bays" }, { status: 500 })

  const targetBays = bayId ? bays.filter((b) => b.id === bayId) : bays

  // Get existing bookings for this day
  let bookingQuery = supabase
    .from("bookings")
    .select("bay_id, starts_at, ends_at")
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", dayStart.toISOString())
    .lte("starts_at", dayEnd.toISOString())

  if (bayId) bookingQuery = bookingQuery.eq("bay_id", bayId)

  const { data: bookings } = await bookingQuery

  // Get blocked times for this day
  let blockQuery = supabase
    .from("blocked_times")
    .select("bay_id, starts_at, ends_at")
    .lte("starts_at", dayEnd.toISOString())
    .gte("ends_at", dayStart.toISOString())

  if (bayId) blockQuery = blockQuery.or(`bay_id.eq.${bayId},bay_id.is.null`)

  const { data: blocks } = await blockQuery

  // Get pricing rules
  const { data: pricingRules } = await supabase
    .from("pricing_rules")
    .select("season_type, day_type, time_type, price_per_hour")

  const rulesMap: Record<string, number> = {}
  for (const rule of pricingRules ?? []) {
    rulesMap[`${rule.season_type}|${rule.day_type}|${rule.time_type}`] = Number(rule.price_per_hour)
  }

  const slots = generateDaySlots(date)

  const result = targetBays.map((bay) => {
    const bayBookings = (bookings ?? []).filter((b) => b.bay_id === bay.id)
    const bayBlocks = (blocks ?? []).filter(
      (b) => b.bay_id === bay.id || b.bay_id === null
    )

    const slotAvailability = slots.map((slot) => {
      const isBooked = bayBookings.some(
        (b) =>
          new Date(b.starts_at) < slot.endsAt &&
          new Date(b.ends_at) > slot.startsAt
      )
      const isBlocked = bayBlocks.some(
        (b) =>
          new Date(b.starts_at) < slot.endsAt &&
          new Date(b.ends_at) > slot.startsAt
      )
      const isPast = slot.startsAt < new Date()
      const context = getPricingContext(slot.startsAt)
      const key = `${context.seasonType}|${context.dayType}|${context.timeType}`
      const pricePerHour = rulesMap[key] ?? 0

      return {
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        label: slot.label,
        available: !isBooked && !isBlocked && !isPast,
        pricePerHour,
        context,
      }
    })

    return {
      bay,
      slots: slotAvailability,
    }
  })

  return NextResponse.json(result)
}
