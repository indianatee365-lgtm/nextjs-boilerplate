import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logFailure, getAdminSetting } from "@/lib/observability/notify"

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

// How long into a session the kiosk keeps showing the "who's playing?" QR
// before giving up on its own (the companion also lets the customer dismiss
// it early via an on-screen X, or the phone flow can close it out sooner by
// confirming roster_confirmed_at) - Jerrod's spec 2026-08-24: only at the
// start of the session, not something nagging mid-round. Negative
// minutesSinceStart (a pre-warmed booking that hasn't technically started
// yet) still passes this check, which is fine - the window is only 3 minutes
// wide during pre-warm, same bound as PRE_WARM_MINUTES below.
const WHO_IS_UP_WINDOW_MINUTES = 5

// If the bay is cold (no booking currently running) and the next confirmed
// booking starts within this many minutes, treat it as "occupied" early so
// the sim chain is already launched and warmed up (UneekorLauncher connect +
// GSPro/GSPconnect handshake, ~60-90s in practice) by the time the customer
// actually walks up - not still cold-starting while they wait. Only kicks in
// when nothing is currently running (checked first, below) - a booking that
// starts right after another one on the same bay is already warm from the
// prior session and doesn't need this.
const PRE_WARM_MINUTES = 3

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastCrashRestartDiagnostics?: Record<string, any>
    lastManualRestartAt?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastManualRestartDiagnostics?: Record<string, any>
    kioskKill?: { process: string; at: string }
    selectedHitter?: string
    selectedHitterBookingId?: string
    addPlayerName?: string
    addPlayerEmail?: string
    addPlayerBookingId?: string
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
    .select("kiosk_kills, override_state, restart_requested_at, last_crash_restart_at, last_manual_restart_at")
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
      // Never write null over an already-stored value here - confirmed live
      // 2026-09-03: a transient blip (most likely service.py reading
      // companion_status.json at the exact instant companion.py was
      // rewriting it) sent one sync call with both of these fields null,
      // which the old unconditional `?? null` happily wrote straight over
      // the correct, already-recorded timestamps. The very next tick sent
      // the real (unchanged) timestamps again, which the dedup check below
      // then saw as "new" relative to the just-nulled row and re-fired BOTH
      // a duplicate crash-restart log AND a false "customer clicked
      // restart" SMS for events that had already happened hours earlier.
      // These two columns only ever move forward now: an incoming null
      // can't erase a real stored value, only a genuinely new non-null
      // timestamp can replace it.
      last_crash_restart_at: status.lastCrashRestartAt ?? existingStatus?.last_crash_restart_at ?? null,
      last_manual_restart_at: status.lastManualRestartAt ?? existingStatus?.last_manual_restart_at ?? null,
      kiosk_kills: kioskKills,
      updated_at: new Date().toISOString(),
    })

    // companion.py's last_crash_restart_at stays set on every heartbeat
    // until the NEXT real crash (it's not a one-shot event flag) - logging
    // it unconditionally here re-inserted the exact same "crash" on every
    // single sync call forever after the first one, not just when it
    // actually changed. Confirmed live 2026-08-29/30: one real crash from
    // 8/26 alone had been re-logged 13,822 times, ~44.8k duplicate rows
    // total across 38 real crashes going back to 8/21 - the same unbounded-
    // logging shape that caused tonight's earlier net._http_response bloat
    // incident. Only log when this timestamp is actually new for this bay -
    // compared as real instants (Date.getTime()), not raw strings: the
    // first attempt at this fix compared the incoming "...T...Z" string
    // straight against Postgres's own "... +00" rendering of the same
    // column, which never matches even for the identical instant, so the
    // dedupe check was always true and the spam kept right on going.
    const incomingCrashMs = status.lastCrashRestartAt ? new Date(status.lastCrashRestartAt).getTime() : null
    const knownCrashMs = existingStatus?.last_crash_restart_at ? new Date(existingStatus.last_crash_restart_at).getTime() : null
    if (incomingCrashMs !== null && incomingCrashMs !== knownCrashMs) {
      // Diagnostics added 2026-09-03 after investigating a real Bay 1 crash
      // with nothing to go on but a bare timestamp - see companion.py's
      // last_crash_restart_diagnostics. missingProcesses is the one that
      // actually answers "what crashed". Also: this event used to also get
      // stamped by every customer-initiated manual restart (see
      // companion.py's 2026-09-03 fix) - a real crash-restart here now only
      // ever means the automatic mid-rental detection actually fired.
      const diagnostics = status.lastCrashRestartDiagnostics ?? {}
      const detail =
        `bay=${bay.name} at=${status.lastCrashRestartAt} ` +
        `missingProcesses=${JSON.stringify(diagnostics.missingProcesses ?? [])} ` +
        `armClicked=${diagnostics.armClicked} gsproStartClicked=${diagnostics.gsproStartClicked} ` +
        `currentHitter=${diagnostics.currentHitter ?? "none"} ` +
        `runningProcesses=${JSON.stringify(diagnostics.runningProcesses ?? [])}`
      const crashNotifyEnabled = await getAdminSetting(serviceClient, "notify_crash_restarts")
      await logFailure(
        serviceClient,
        "bay-agent-crash-restart",
        detail,
        crashNotifyEnabled
          ? `${bay.name}: simulator crashed mid-rental and auto-recovered. Missing: ` +
            `${(diagnostics.missingProcesses ?? []).join(", ") || "unknown"}. Check admin/logs for details.`
          : undefined,
      )
    }

    // Customer-clicked "Simulator issue? Click to restart" - Jerrod's ask
    // 2026-09-02: know when a real customer hits this and have enough state
    // to guess why, without adding an extra "what's wrong?" step for them.
    // Same dedup shape as crash-restart just above (last_manual_restart_at
    // stays set on every heartbeat until the next click, not a one-shot
    // flag - only log/alert when it's actually a new timestamp).
    const incomingManualRestartMs = status.lastManualRestartAt ? new Date(status.lastManualRestartAt).getTime() : null
    const knownManualRestartMs = existingStatus?.last_manual_restart_at
      ? new Date(existingStatus.last_manual_restart_at).getTime()
      : null
    if (incomingManualRestartMs !== null && incomingManualRestartMs !== knownManualRestartMs) {
      const diagnostics = status.lastManualRestartDiagnostics ?? {}
      const detail =
        `bay=${bay.name} at=${status.lastManualRestartAt} ` +
        `simRunning=${diagnostics.simRunning} chainConfirmedUp=${diagnostics.chainConfirmedUp} ` +
        `gsproStartClicked=${diagnostics.gsproStartClicked} currentHitter=${diagnostics.currentHitter ?? "none"} ` +
        `runningProcesses=${JSON.stringify(diagnostics.runningProcesses ?? [])}`
      const notifyEnabled = await getAdminSetting(serviceClient, "notify_restart_clicks")
      await logFailure(
        serviceClient,
        "bay-agent-manual-restart-clicked",
        detail,
        notifyEnabled
          ? `${bay.name}: customer clicked "Simulator issue? Click to restart". ` +
            `Sim was ${diagnostics.simRunning ? "running" : "NOT running"} at the time. Check admin/logs for details.`
          : undefined,
      )
    }

    // Kiosk-side hitter selection (companion.py's on-screen selector, see
    // showWhoIsUpPrompt's rosterNames/currentHitter below) - same write the
    // phone's setCurrentHitter action makes, just reported up through the
    // bay's own heartbeat instead of a customer's authenticated phone
    // request. No extra auth needed beyond the bay's own agent_token, already
    // checked above - same trust level as this endpoint already reporting
    // kiosk_kills or crash-restart timestamps for this bay.
    if (status.selectedHitter && status.selectedHitterBookingId) {
      await serviceClient
        .from("bookings")
        .update({ current_hitter: status.selectedHitter })
        .eq("id", status.selectedHitterBookingId)
        .eq("status", "confirmed")
    }

    // Kiosk-side "type a name" add (companion.py's on-screen Entry field,
    // see _add_player). Writes straight to roster_names through this same
    // trusted bay-agent channel instead of routing through the phone's
    // /who-is-up page, because that page turned out to be a dead end here:
    // once roster_confirmed_at is set it never renders the add form again,
    // solo or otherwise (fixed separately for the phone side by actions.ts's
    // new addPlayer export, but the kiosk doesn't depend on that fix at all).
    // Optional email field added 2026-09-01 (Jerrod's ask, live) - same
    // admin.listUsers()-and-match lookup as confirmRoster/addPlayer, so a
    // kiosk-typed name can get properly linked instead of always falling
    // back to the booker's account (or being dropped outright per
    // shot/route.ts's unlinked-guest rule) for shot attribution.
    if (status.addPlayerName && status.addPlayerBookingId) {
      const { data: targetBooking } = await serviceClient
        .from("bookings")
        .select("user_id, roster_names, roster_links, roster_confirmed_at, current_hitter, profiles!user_id(first_name)")
        .eq("id", status.addPlayerBookingId)
        .eq("status", "confirmed")
        .single()

      if (targetBooking) {
        let existingNames = (targetBooking.roster_names as string[] | null) ?? []
        const rosterLinks = { ...((targetBooking.roster_links as Record<string, string> | null) ?? {}) }
        const cleanName = status.addPlayerName.trim()

        // Nobody's ever confirmed a roster for this booking (kiosk showing
        // the booker's name as a default placeholder, see companion.py's
        // 2026-09-01 update - the booker never went through confirmRoster to
        // land in roster_names/roster_links themselves). Seed them in first
        // so adding a second name here doesn't silently replace them the way
        // it would have before roster_links covered player 0 at all.
        let currentHitter = targetBooking.current_hitter as string | null
        if (existingNames.length === 0) {
          const profile = targetBooking.profiles as { first_name: string } | null
          const bookerName = profile?.first_name
          if (bookerName) {
            existingNames = [bookerName]
            rosterLinks[bookerName] = targetBooking.user_id as string
            currentHitter = currentHitter ?? bookerName
          }
        }

        if (cleanName && !existingNames.includes(cleanName) && existingNames.length < 6) {
          const cleanEmail = (status.addPlayerEmail ?? "").trim().toLowerCase()
          if (cleanEmail) {
            const { data: usersPage } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
            const match = usersPage?.users.find((u: { email?: string }) => u.email?.toLowerCase() === cleanEmail)
            if (match) rosterLinks[cleanName] = match.id
          }
          await serviceClient
            .from("bookings")
            .update({
              roster_names: [...existingNames, cleanName],
              roster_links: Object.keys(rosterLinks).length > 0 ? rosterLinks : null,
              roster_confirmed_at: targetBooking.roster_confirmed_at ?? new Date().toISOString(),
              current_hitter: currentHitter,
            })
            .eq("id", status.addPlayerBookingId)
        }
      }
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

  const { data: activeBooking } = await serviceClient
    .from("bookings")
    .select("id, starts_at, ends_at, extend_token, bay_powered_on_at, roster_confirmed_at, roster_names, current_hitter, profiles!user_id(first_name)")
    .eq("bay_id", bayId)
    .eq("status", "confirmed")
    .lte("starts_at", now.toISOString())
    .gt("ends_at", now.toISOString())
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let booking = activeBooking

  // Bay is cold (nothing currently running) - check for a pre-warm candidate
  // before falling through to "available". Ordered ascending (soonest first)
  // since only one can be within the window at a time for a single bay in
  // normal scheduling, but soonest-first is the correct tiebreak if that
  // invariant is ever violated.
  if (!booking) {
    const preWarmCutoff = new Date(now.getTime() + PRE_WARM_MINUTES * 60000)
    const { data: upcomingBooking } = await serviceClient
      .from("bookings")
      .select("id, starts_at, ends_at, extend_token, bay_powered_on_at, roster_confirmed_at, roster_names, current_hitter, profiles!user_id(first_name)")
      .eq("bay_id", bayId)
      .eq("status", "confirmed")
      .gt("starts_at", now.toISOString())
      .lte("starts_at", preWarmCutoff.toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    booking = upcomingBooking
  }

  // Close out the audit trail (bay_powered_on_at/bay_powered_off_at, pre-existing
  // columns on bookings that predate this feature but were never wired up) for
  // any of this bay's bookings that ended since the last poll. Self-healing by
  // design, same as everything else here - no in-memory "was this booking active
  // last time" state to get out of sync.
  await serviceClient
    .from("bookings")
    .update({ bay_powered_off_at: now.toISOString() })
    .eq("bay_id", bayId)
    .not("bay_powered_on_at", "is", null)
    .is("bay_powered_off_at", null)
    .lte("ends_at", now.toISOString())

  if (!booking) {
    return NextResponse.json({
      desiredState: "available",
      booking: null,
      serverTime: now.toISOString(),
    })
  }

  if (!booking.bay_powered_on_at) {
    await serviceClient
      .from("bookings")
      .update({ bay_powered_on_at: now.toISOString() })
      .eq("id", booking.id)
  }

  const endsAt = new Date(booking.ends_at)
  const minutesRemaining = (endsAt.getTime() - now.getTime()) / 60000
  const profile = booking.profiles as { first_name: string } | null

  const minutesSinceStart = (now.getTime() - new Date(booking.starts_at).getTime()) / 60000

  const response: {
    desiredState: "occupied"
    booking: { id: string; customerFirstName: string | null; endsAt: string }
    serverTime: string
    showExtendPrompt?: boolean
    extendUrl?: string
    minutesRemaining?: number
    showWhoIsUpPrompt?: boolean
    whoIsUpUrl?: string
    rosterNames?: string[] | null
    currentHitter?: string | null
    restartRequestedAt?: string | null
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

  // whoIsUpUrl is always sent for an active booking - not just within the
  // opening window - so the kiosk's minimized "who's up?" icon keeps working
  // for the rest of the session even after a companion restart wipes its
  // in-memory cache (found live 2026-08-24 redeploying mid-test: the window
  // had already closed, so a fresh process had no way to recover the url).
  // showWhoIsUpPrompt stays gated to the opening window - that flag only
  // controls the one-time auto-popup, not whether the link itself works.
  response.whoIsUpUrl = `https://tee365.org/who-is-up/${booking.id}?token=${booking.extend_token}`
  // Always sent too, same reasoning - the kiosk-side selector (once a roster
  // exists) needs to stay in sync with whatever the phone side last set,
  // independent of the opening-window gate.
  response.rosterNames = booking.roster_names ?? null
  response.currentHitter = booking.current_hitter ?? null
  if (!booking.roster_confirmed_at && minutesSinceStart <= WHO_IS_UP_WINDOW_MINUTES) {
    response.showWhoIsUpPrompt = true
  }

  // Admin dashboard's "Restart Simulator" button (see admin/bays/actions.ts's
  // requestBayRestart) - companion.py compares this timestamp against the
  // last one it already acted on, so it only fires once per admin click, not
  // every poll while it's still the newest value.
  response.restartRequestedAt = existingStatus?.restart_requested_at ?? null

  return NextResponse.json(response)
}
