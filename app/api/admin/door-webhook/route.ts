import { NextResponse } from "next/server"
import { requireAdminApi } from "@/lib/admin/guard"
import { registerDoorUnlockWebhook } from "@/lib/access-control"
import { logEvent } from "@/lib/observability/notify"

export const dynamic = "force-dynamic"

const ENDPOINT = "https://tee365.org/api/unifi/webhook"

// One-time hookup for door entry alerts: asks UniFi Access to post every door
// unlock to /api/unifi/webhook and stores the signing secret it hands back.
// Safe to run again, it replaces the old registration and secret together.
export async function POST() {
  const admin = await requireAdminApi()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let hook: { id: string; secret: string }
  try {
    hook = await registerDoorUnlockWebhook(ENDPOINT)
  } catch (err) {
    return NextResponse.json({ error: String(err).slice(0, 300) }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.serviceClient as any)
    .from("door_webhook")
    .upsert({ id: 1, unifi_endpoint_id: hook.id, secret: hook.secret, created_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logEvent(admin.serviceClient, "door-webhook-registered", `endpoint=${ENDPOINT} unifi_id=${hook.id}`)
  return NextResponse.json({ ok: true, unifiEndpointId: hook.id })
}
