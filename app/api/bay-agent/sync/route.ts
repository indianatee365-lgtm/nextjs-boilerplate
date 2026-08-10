import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

export const runtime = "nodejs"

// Called by each bay PC's agent every ~10-15s. Combines heartbeat-in and
// desired-state-out in one round trip: the agent reports what it's currently
// doing, we tell it what it should be doing next. State is always recomputed
// live from `bookings` on every call rather than reacting to a one-shot
// "booking started/ended" event, so a missed poll or a mid-round extension
// can't leave a bay stuck in the wrong state - the very next poll self-corrects.
//
// LAUNCH: agent_token is set per-bay by the 20260809_bay_agent.sql migration.
// See docs/bay-agent.md.

const EXTEND_PROMPT_WINDOW_MINUTES = 15
const KIOSK_KILLS_LOG_LIMIT = 20

interface SyncRequestBody {
  bayId?: string
  token?: string
  status?: {
    agentVersion?: string
    enforcementMode?: "shadow" | "live"
    sessionState?: "occupied" | "available"
    simRunning?: boolean
    runningProcesses?: string[]
    lastCrashRestartAt?: string
    kioskKill?: { process: string; at: string }
  }
}

export async function POST(request: NextRequest) {
  let body: SyncRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { bayId, token, status } = body
  if (!bayId || !token) {
    return NextResponse.json({ error: "Missing bayId or token" }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  const { data: bay } = await serviceClient
    .from("bays")
    .select("id, name, active, agent_token")
    .eq("id", bayId)
    .single()

  if (!bay || !bay.agent_token || bay.agent_token !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: existingStatus } = await serviceClient
    .from("bay_agent_status")
    .select("kiosk_kills, override_state")
    .eq("bay_id", bayId)
    .single()

  if (status) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kioskKills = ((existingStatus?.kiosk_kills as any[]) ?? []).slice()
    if (status.kioskKill) {
      kioskKills.push(status.kioskKill)
      while (kioskKills.length > KIOSK_KILLS_LOG_LIMIT) kioskKills.shift()
    }

    await serviceClient.from("bay_agent_status").upsert({
      bay_id: bayId,
      last_heartbeat_at: new Date().toISOString(),
      agent_version: status.agentVersion ?? null,
      enforcement_mode: status.enforcementMode ?? null,
      session_state: status.sessionState ?? null,
      sim_running: status.simRunning ?? null,
      running_processes: status.runningProcesses ?? null,
      last_crash_restart_at: status.lastCrashRestartAt ?? null,
      kiosk_kills: kioskKills,
      updated_at: new Date().toISOString(),
    })

    if (status.lastCrashRestartAt) {
      await logEvent(serviceClient, "bay-agent-crash-restart", `bay=${bay.name} at=${status.lastCrashRestartAt}`)
    }
  }

  const overrideState = existingStatus?.override_state as "occupied" | "available" | "maintenance" | null

  if (overrideState === "maintenance") {
    return NextResponse.json({
      desiredState: "maintenance",
      booking: null,
      serverTime: new Date().toISOString(),
    })
  }

  if (overrideState === "occupied" || overrideState === "available") {
    return NextResponse.json({
      desiredState: overrideState,
      booking: null,
      serverTime: new Date().toISOString(),
    })
  }

  if (!bay.active) {
    return NextResponse.json({
      desiredState: "available",
      booking: null,
      serverTime: new Date().toISOString(),
    })
  }

  const now = new Date()

  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, ends_at, extend_token, profiles!user_id(first_name)")
    .eq("bay_id", bayId)
    .eq("status", "confirmed")
    .lte("starts_at", now.toISOString())
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!booking) {
    return NextResponse.json({
      desiredState: "available",
      booking: null,
      serverTime: now.toISOString(),
    })
  }

  const endsAt = new Date(booking.ends_at)
  const minutesRemaining = (endsAt.getTime() - now.getTime()) / 60000
  const profile = booking.profiles as { first_name: string } | null

  const response: {
    desiredState: "occupied"
    booking: { id: string; customerFirstName: string | null; endsAt: string }
    serverTime: string
    showExtendPrompt?: boolean
    extendUrl?: string
    minutesRemaining?: number
  } = {
    desiredState: "occupied",
    booking: { id: booking.id, customerFirstName: profile?.first_name ?? null, endsAt: booking.ends_at },
    serverTime: now.toISOString(),
  }

  if (minutesRemaining <= EXTEND_PROMPT_WINDOW_MINUTES) {
    response.showExtendPrompt = true
    response.extendUrl = `https://tee365.org/extend/${booking.id}?token=${booking.extend_token}`
    response.minutesRemaining = Math.max(0, Math.round(minutesRemaining))
  }

  return NextResponse.json(response)
}
