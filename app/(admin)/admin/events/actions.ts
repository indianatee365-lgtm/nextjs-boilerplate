"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { cancelEvent, createEvent, recordManualPayment, sendPaymentLink, type EventRow, type NewEventInput } from "@/lib/events"
import { quoteFor } from "@/lib/events/quote"

async function admin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")
  // Events tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((p as { role: string } | null)?.role !== "admin") throw new Error("Admins only")
  return { db, userId: user.id }
}

export async function createEventAction(input: NewEventInput) {
  const { db, userId } = await admin()
  const res = await createEvent(db, input, userId)
  if (res.ok) revalidatePath("/admin/events")
  return res
}

export async function resendLinkAction(eventId: string) {
  const { db } = await admin()
  const { data } = await db.from("events").select("*").eq("id", eventId).single()
  const sent = await sendPaymentLink(db, data as EventRow, "reminder")
  return sent
}

export async function manualPaymentAction(eventId: string, amount: number, note: string) {
  const { db } = await admin()
  const a = Math.round(Number(amount) * 100) / 100
  if (!(a > 0)) return { ok: false, error: "Enter an amount." }
  await recordManualPayment(db, eventId, a, note)
  revalidatePath(`/admin/events/${eventId}`)
  return { ok: true }
}

export async function cancelEventAction(eventId: string, refundPaymentIds: string[]) {
  const { db } = await admin()
  const res = await cancelEvent(db, eventId, refundPaymentIds)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath("/admin/events")
  return res
}

/** List-price base for a quote (lib/events/quote). */
export async function quoteAction(dateKey: string, startMinutes: number, durationMinutes: number, bays: number) {
  const { db } = await admin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Bad date")
  const dur = Math.max(30, Math.min(24 * 60, Math.round(Number(durationMinutes))))
  const n = Math.max(1, Math.min(8, Math.round(Number(bays))))
  const { data } = await db.from("pricing_rules").select("season_type, day_type, time_type, price_per_hour")
  const rules: Record<string, number> = {}
  for (const r of (data ?? []) as { season_type: string; day_type: string; time_type: string; price_per_hour: number }[]) rules[`${r.season_type}|${r.day_type}|${r.time_type}`] = Number(r.price_per_hour)
  return quoteFor(rules, dateKey, Math.round(Number(startMinutes)), dur, n)
}
