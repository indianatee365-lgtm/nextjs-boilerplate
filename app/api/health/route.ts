import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Polled once a minute by labserver's /home/jerrod/scripts/tee365-uptime.py,
// which texts Jerrod on Telegram when this fails or a bay goes quiet. Added
// 2026-10-15 after a dropped database read inside a bay check-in sent two
// false alerts at 4:31 AM. One cheap read per table, nothing customer-facing
// in the response: bay names, heartbeat ages, missing remote-access tools and a count.
const SYNC_ERROR_WINDOW_MINUTES = 10
// Remote-access processes every bay must be running. Read from the bay's own
// check-in, so a dead Tailscale still shows up here. Added 2026-11-12 after
// Tailscale sat stopped on bays 3 and 4 for two days with no alert.
const REMOTE_ACCESS_PROCESSES: Record<string, string> = {
  "tailscaled.exe": "Tailscale",
  "sshd.exe": "SSH",
  "teamviewer_service.exe": "TeamViewer",
  "rustdesk.exe": "RustDesk",
}

export async function GET(request: Request) {
  const started = Date.now()
  const serviceClient = await createServiceClient()
  // labserver's monitor sends this header so /api/cron/watchdog can text
  // Jerrod when labserver itself goes quiet. Other callers are not recorded.
  const monitorSecret = process.env.UPTIME_MONITOR_SECRET
  if (monitorSecret && request.headers.get("x-uptime-monitor") === monitorSecret) {
    await serviceClient
      .from("system_heartbeats")
      .upsert({ name: "labserver", last_seen_at: new Date().toISOString() }, { onConflict: "name" })
  }
  const since = new Date(Date.now() - SYNC_ERROR_WINDOW_MINUTES * 60_000).toISOString()

  const [baysRes, statusRes, errorsRes] = await Promise.all([
    serviceClient.from("bays").select("id, name, active"),
    serviceClient.from("bay_agent_status").select("bay_id, last_heartbeat_at, running_processes"),
    serviceClient
      .from("admin_logs")
      .select("id", { count: "exact", head: true })
      .eq("event", "bay-agent-sync-db-error")
      .gte("created_at", since),
  ])

  const dbError = baysRes.error ?? statusRes.error ?? errorsRes.error
  if (dbError) {
    console.error(`health check db error: code=${dbError.code ?? "none"} message=${dbError.message ?? "none"}`)
    return NextResponse.json(
      { ok: false, db: false, error: dbError.message ?? "database error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  const heartbeats = new Map((statusRes.data ?? []).map((s) => [s.bay_id, s.last_heartbeat_at as string | null]))
  const processes = new Map((statusRes.data ?? []).map((s) => [s.bay_id, (s.running_processes as string[] | null) ?? null]))
  const bays = (baysRes.data ?? [])
    .filter((b) => b.active)
    .map((b) => {
      const last = heartbeats.get(b.id)
      const running = processes.get(b.id)
      return {
        name: b.name,
        heartbeatAgeSeconds: last ? Math.round((Date.now() - new Date(last).getTime()) / 1000) : null,
        remoteAccessDown: running
          ? Object.entries(REMOTE_ACCESS_PROCESSES)
              .filter(([process]) => !running.includes(process))
              .map(([, label]) => label)
          : [],
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json(
    {
      ok: true,
      db: true,
      dbMs: Date.now() - started,
      bays,
      syncDbErrors10m: errorsRes.count ?? 0,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
