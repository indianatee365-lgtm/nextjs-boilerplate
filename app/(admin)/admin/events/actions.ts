"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { cancelEvent, createEvent, recordManualPayment, sendPaymentLink, type EventRow, type NewEventInput } from "@/lib/events"

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
