import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const VAPI_BASE = "https://api.vapi.ai"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

// Vapi now requires authenticated requests to fetch call recordings (public
// recordingUrl values stop working July 2026). This proxies the admin UI's
// <audio> requests through an authenticated Vapi call and redirects to the
// short-lived signed URL Vapi returns.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  if (!await assertAdmin()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const apiKey = process.env.VAPI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "VAPI_API_KEY not configured" }, { status: 503 })
  }

  const { callId } = await params

  const res = await fetch(`${VAPI_BASE}/call/${callId}/mono-recording`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: "manual",
  })

  const location = res.headers.get("location")
  if (!location) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 })
  }

  return NextResponse.redirect(location)
}
