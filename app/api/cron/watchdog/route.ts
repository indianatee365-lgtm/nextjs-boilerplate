import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { notifyOwner } from "@/lib/observability/notify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Backup alerting that does not depend on labserver (2026-11-12). labserver's
// tee365-uptime.py does the real monitoring and messages Jerrod on Telegram,
// but if labserver itself goes down nothing would say so. This runs on Vercel
// every 5 min (see vercel.json) and texts by SMS when:
//   - labserver has not checked in through /api/health for LABSERVER_STALE_MINUTES,
//   - and, only while labserver is quiet, a bay has stopped checking in.
// Bays report straight to the website, so their check-ins keep working
// without labserver or Tailscale. One text when a problem starts, one when it clears.
const LABSERVER_STALE_MINUTES = 10
const BAY_STALE_MINUTES = 10

type Heartbeat = { name: string; last_seen_at: string | null; alerted: boolean }

function minutesSince(iso: string | null): number | null {
  return iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60_000) : null
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  const [beatsRes, baysRes, statusRes] = await Promise.all([
    serviceClient.from("system_heartbeats").select("name, last_seen_at, alerted"),
    serviceClient.from("bays").select("id, name, active"),
    serviceClient.from("bay_agent_status").select("bay_id, last_heartbeat_at"),
  ])
  const dbError = beatsRes.error ?? baysRes.error ?? statusRes.error
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 503 })
  }

  const beats = new Map(((beatsRes.data ?? []) as Heartbeat[]).map((b) => [b.name, b]))
  const sent: string[] = []
  const setAlerted = async (name: string, alerted: boolean) => {
    await serviceClient.from("system_heartbeats").upsert({ name, alerted }, { onConflict: "name" })
  }

  // No row yet means labserver has never checked in since this shipped: stay quiet.
  const labserver = beats.get("labserver")
  const labMinutes = minutesSince(labserver?.last_seen_at ?? null)
  const labDown = labMinutes !== null && labMinutes >= LABSERVER_STALE_MINUTES
  if (labserver && labDown && !labserver.alerted) {
    await notifyOwner(
      `Tee365: labserver has not checked in for ${labMinutes} min, so Telegram bay alerts and RustDesk are down with it. ` +
        "This website watchdog will text you if a bay stops checking in. Bays are still reachable by TeamViewer."
    )
    await setAlerted("labserver", true)
    sent.push("labserver down")
  } else if (labserver && !labDown && labserver.alerted) {
    await notifyOwner("Tee365: labserver is checking in again. Telegram alerts are back.")
    await setAlerted("labserver", false)
    sent.push("labserver back")
  }

  // Bays, only while labserver cannot alert about them itself. A bay alerted
  // here still gets its all-clear after labserver comes back.
  const lastBay = new Map((statusRes.data ?? []).map((s) => [s.bay_id, s.last_heartbeat_at as string | null]))
  for (const bay of (baysRes.data ?? []).filter((b) => b.active)) {
    const key = `bay:${bay.name}`
    const row = beats.get(key)
    const age = minutesSince(lastBay.get(bay.id) ?? null)
    const stale = age === null || age >= BAY_STALE_MINUTES
    if (stale && labDown && !row?.alerted) {
      const last = age === null ? "never" : `${age} min ago`
      await notifyOwner(`Tee365: ${bay.name} has stopped checking in (last ${last}). The PC may be off or offline.`)
      await setAlerted(key, true)
      sent.push(`${bay.name} down`)
    } else if (!stale && row?.alerted) {
      await notifyOwner(`Tee365: ${bay.name} is checking in again.`)
      await setAlerted(key, false)
      sent.push(`${bay.name} back`)
    }
  }

  return NextResponse.json({ ok: true, labserverMinutes: labMinutes, sent })
}
