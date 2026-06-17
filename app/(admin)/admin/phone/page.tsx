import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import PhoneAgentClient from "./PhoneAgentClient"

export const metadata = { title: "Phone Agent | Tee365" }
export const dynamic = "force-dynamic"

export default async function PhoneAgentPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/account")

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: calls },
    { count: totalCalls },
    { count: callsThisWeek },
    { count: missedCalls },
    { data: durationData },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("call_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("call_logs").select("id", { count: "exact", head: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("call_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("call_logs")
      .select("id", { count: "exact", head: true })
      .in("ended_reason", ["customer-did-not-answer", "voicemail"]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (serviceClient as any).from("call_logs")
      .select("duration_seconds")
      .not("duration_seconds", "is", null)
      .gt("duration_seconds", 0),
  ])

  const avgDurationSeconds = durationData && durationData.length > 0
    ? Math.round(
        durationData.reduce((sum: number, r: { duration_seconds: number }) => sum + r.duration_seconds, 0)
        / durationData.length
      )
    : 0

  return (
    <PhoneAgentClient
      calls={calls ?? []}
      stats={{
        totalCalls: totalCalls ?? 0,
        callsThisWeek: callsThisWeek ?? 0,
        avgDurationSeconds,
        missedCalls: missedCalls ?? 0,
      }}
    />
  )
}
