import { NextResponse } from "next/server"

// Replaced 2026-10-07 by team signup (/api/leagues/team) and partner accept
// (/api/leagues/join/[token]). Kept answering so an old cached page gets a
// clear message instead of a 404.
export async function POST() {
  return NextResponse.json({ error: "Signup has moved. Refresh the league page and sign up your team." }, { status: 410 })
}
