import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import ShotsRealtimeRefresher from "./ShotsRealtimeRefresher"

export const metadata = { title: "My Shots | Tee365" }

interface SessionSummary {
  bookingId: string
  bayName: string
  firstShotAt: string
  lastShotAt: string
  count: number
}

export default async function ShotsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: shots } = await serviceClient
    .from("shots")
    .select("booking_id, created_at, bays(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(2000)

  // Grouped in JS rather than a DB-side aggregate - the dataset per customer
  // is small enough that this is simpler than standing up a view, and the
  // page is already pulling every row for the realtime refresh to matter.
  const sessions = new Map<string, SessionSummary>()
  for (const s of shots ?? []) {
    if (!s.booking_id) continue
    const bay = s.bays as { name: string } | null
    const existing = sessions.get(s.booking_id)
    if (!existing) {
      sessions.set(s.booking_id, {
        bookingId: s.booking_id,
        bayName: bay?.name ?? "Bay",
        firstShotAt: s.created_at,
        lastShotAt: s.created_at,
        count: 1,
      })
    } else {
      existing.count += 1
      if (s.created_at > existing.lastShotAt) existing.lastShotAt = s.created_at
      if (s.created_at < existing.firstShotAt) existing.firstShotAt = s.created_at
    }
  }
  const sessionList = Array.from(sessions.values()).sort((a, b) => b.lastShotAt.localeCompare(a.lastShotAt))

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <ShotsRealtimeRefresher userId={user.id} />
      <h1 className="text-2xl font-semibold text-white mb-6">My Shots</h1>

      {sessionList.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No sessions recorded yet. Once you hit balls during a session at a bay, they&apos;ll show up here automatically.
        </p>
      ) : (
        <div className="space-y-3">
          {sessionList.map((s) => (
            <Link
              key={s.bookingId}
              href={`/account/shots/${s.bookingId}`}
              className="block rounded-xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/30"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">
                    {new Date(s.firstShotAt).toLocaleDateString("en-US", {
                      weekday: "long", month: "long", day: "numeric", year: "numeric",
                      timeZone: "America/Indiana/Indianapolis",
                    })}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-400">{s.bayName}</p>
                </div>
                <p className="text-sm text-neutral-400">{s.count} shot{s.count === 1 ? "" : "s"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
