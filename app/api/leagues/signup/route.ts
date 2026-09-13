import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

async function notifyAdmin(subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tee365 <jerrod@tee365.org>",
      to: ["info@tee365.org"],
      subject,
      html,
    }),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Sign in to claim a spot" }, { status: 401 })
  }

  const { leagueId, partnerName, preferredSlot } = await req.json()

  if (!leagueId || typeof leagueId !== "string") {
    return NextResponse.json({ error: "League required" }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: league, error: leagueError } = await service
    .from("leagues")
    .select("id, name, max_players, signup_closes_on, active")
    .eq("id", leagueId)
    .maybeSingle()

  if (leagueError || !league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 })
  }

  if (!league.active) {
    return NextResponse.json({ error: "This league is not open for signups yet" }, { status: 403 })
  }

  // Compare as plain dates. The column is a date, so a UTC-based comparison
  // would close signups a day early for anyone in Eastern.
  if (league.signup_closes_on) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
    if (today > league.signup_closes_on) {
      return NextResponse.json({ error: "Signups for this league have closed" }, { status: 409 })
    }
  }

  const { count } = await service
    .from("league_participants")
    .select("id", { count: "exact", head: true })
    .eq("league_id", league.id)
    .eq("status", "registered")

  const maxPlayers = league.max_players ?? 32
  const status = (count ?? 0) >= maxPlayers ? "waitlisted" : "registered"

  const { error: insertError } = await service
    .from("league_participants")
    .upsert(
      {
        league_id: league.id,
        user_id: user.id,
        partner_name: typeof partnerName === "string" && partnerName.trim() ? partnerName.trim() : null,
        preferred_slot: typeof preferredSlot === "string" ? preferredSlot : null,
        status,
        active: true,
      },
      { onConflict: "league_id,user_id" }
    )

  if (insertError) {
    console.error("[league-signup] DB upsert error:", insertError)
    return NextResponse.json({ error: "Signup failed" }, { status: 500 })
  }

  const { data: profile } = await service
    .from("profiles")
    .select("first_name, last_name, phone")
    .eq("id", user.id)
    .maybeSingle()

  const playerName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")

  try {
    await notifyAdmin(
      `${status === "waitlisted" ? "Waitlist" : "New"} league signup: ${league.name}`,
      `<p style="font-family:sans-serif;">
        Player: ${playerName || "(no name)"}<br>
        Email: ${user.email}<br>
        Phone: ${profile?.phone || "(none)"}<br>
        Partner: ${partnerName || "(needs pairing)"}<br>
        Tee time: ${preferredSlot || "either"}<br>
        Status: ${status}<br>
        Roster now: ${(count ?? 0) + (status === "registered" ? 1 : 0)} of ${maxPlayers}
      </p>`
    )
  } catch (err) {
    console.error("[league-signup] Email error:", err)
  }

  return NextResponse.json({ success: true, status })
}
