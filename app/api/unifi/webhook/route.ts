import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyOwner, logFailure, getAdminSetting } from "@/lib/observability/notify"
import { describeUnlockMethod } from "@/lib/access-control/door-entries"

// UniFi Access posts every door unlock here (registered once through
// /api/admin/door-webhook, needs Access 2.2.10+). A booking's PIN belongs to
// the UniFi user grantBayAccess created, whose id is saved on the booking as
// unifi_visitor_id, so the unlock's actor id leads straight back to the
// booking and the customer. Unlocks that match no booking (the owner's own
// PIN, event and league codes, app unlocks) are logged and nothing else.
//
// Owner text once per booking, on the first entry only, behind two switches
// on /admin/settings: notify_door_entries (all alerts) and
// notify_door_entries_first_visit_only (Jerrod 2026-10-29: he already watches
// most first-timers on the cameras, this narrows down who to look for).
// A third switch, notify_all_door_unlocks, texts every unlock of any kind
// (app, owner code, re-entries) and overrides the other two.

const MAX_SIGNATURE_AGE_SECONDS = 300

// Signature header is "t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>".
function verifySignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const parts: Record<string, string> = {}
  for (const part of header.split(",")) {
    const i = part.indexOf("=")
    if (i > 0) parts[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  const { t, v1 } = parts
  if (!t || !v1) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > MAX_SIGNATURE_AGE_SECONDS) return false
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}

interface UnlockEvent {
  event?: string
  event_object_id?: string
  data?: {
    actor?: { id?: string; name?: string; type?: string } | null
    object?: { authentication_type?: string; result?: string } | null
  }
}

interface MatchedBooking {
  id: string
  user_id: string
  starts_at: string
  bays: { name: string } | null
  profiles: { first_name: string | null; last_name: string | null } | null
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  // door_webhook and door_entries are not in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createServiceClient()) as any

  const { data: hook } = await db.from("door_webhook").select("secret").eq("id", 1).maybeSingle()
  if (!hook || !verifySignature(rawBody, request.headers.get("signature"), hook.secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: UnlockEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 })
  }
  if (event.event !== "access.door.unlock") return NextResponse.json({ ok: true })

  const actor = event.data?.actor
  const obj = event.data?.object

  let booking: MatchedBooking | null = null
  if (actor?.id) {
    const { data } = await db
      .from("bookings")
      .select("id, user_id, starts_at, bays(name), profiles!user_id(first_name, last_name)")
      .eq("unifi_visitor_id", actor.id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    booking = data ?? null
  }

  // First visit means no earlier booking that wasn't cancelled.
  let firstVisit: boolean | null = null
  if (booking) {
    const { count } = await db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", booking.user_id)
      .neq("status", "cancelled")
      .lt("starts_at", booking.starts_at)
    firstVisit = count === 0
  }

  // Re-entries on the same booking are logged but never text twice.
  let alreadyAlerted = false
  if (booking) {
    const { count } = await db
      .from("door_entries")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id)
      .eq("alerted", true)
    alreadyAlerted = (count ?? 0) > 0
  }

  const shouldAlert =
    (await getAdminSetting(db, "notify_all_door_unlocks")) ||
    (!!booking &&
      !alreadyAlerted &&
      (await getAdminSetting(db, "notify_door_entries")) &&
      (firstVisit || !(await getAdminSetting(db, "notify_door_entries_first_visit_only"))))

  // unifi_event_id is unique, so a UniFi retry of the same event stops here.
  const { error: insertErr } = await db.from("door_entries").insert({
    unifi_event_id: event.event_object_id ?? null,
    unifi_user_id: actor?.id ?? null,
    booking_id: booking?.id ?? null,
    actor_name: actor?.name ?? null,
    auth_type: obj?.authentication_type ?? null,
    result: obj?.result ?? null,
    first_visit: firstVisit,
    alerted: shouldAlert,
  })
  if (insertErr) {
    if (insertErr.code === "23505") return NextResponse.json({ ok: true })
    await logFailure(db, "door-entry-log-FAILED", `event=${event.event_object_id} err=${insertErr.message.slice(0, 200)}`)
  }

  if (shouldAlert) {
    const name =
      [booking?.profiles?.first_name, booking?.profiles?.last_name].filter(Boolean).join(" ") ||
      actor?.name ||
      "Someone"
    const time = new Date().toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Indiana/Indianapolis",
    })
    await notifyOwner(
      `Door: ${name} came in by ${describeUnlockMethod(obj?.authentication_type)}` +
        `${booking?.bays?.name ? ` for ${booking.bays.name}` : ""}, ${time}.${firstVisit ? " First visit." : ""}`,
    )
  }

  return NextResponse.json({ ok: true })
}
