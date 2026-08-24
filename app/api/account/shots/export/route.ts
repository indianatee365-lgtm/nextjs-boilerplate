import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Optional bookingId scopes the export to one session (the detail page's
  // download button) - omitted, it exports everything (the sessions-list
  // page's download-all).
  const bookingId = request.nextUrl.searchParams.get("bookingId")

  let query = serviceClient
    .from("shots")
    .select("created_at, hitter_name, club, carry_yards, ball_speed_mph, club_speed_mph, total_spin, back_spin, side_spin, hla, vla, path, angle_of_attack, face_to_target, bays(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5000)
  if (bookingId) {
    query = query.eq("booking_id", bookingId)
  }

  const { data: shots } = await query

  const header = [
    "date", "bay", "player", "club", "carry_yards", "ball_speed_mph", "club_speed_mph",
    "total_spin", "back_spin", "side_spin", "hla", "vla", "path", "angle_of_attack", "face_to_target",
  ]
  const rows = (shots ?? []).map((s) => {
    const bay = s.bays as { name: string } | null
    return [
      s.created_at, bay?.name ?? "", s.hitter_name ?? "", s.club ?? "",
      s.carry_yards, s.ball_speed_mph, s.club_speed_mph, s.total_spin,
      s.back_spin, s.side_spin, s.hla, s.vla, s.path, s.angle_of_attack, s.face_to_target,
    ].map(csvCell).join(",")
  })

  const csv = [header.join(","), ...rows].join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="tee365-shots-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
