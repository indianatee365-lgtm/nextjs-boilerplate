"use server"

import { revalidatePath } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { cancelParty, createParty, refundOrder, updateParty, type NewParty } from "@/lib/tickets"

async function admin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")
  // Party tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((p as { role: string } | null)?.role !== "admin") throw new Error("Admins only")
  return { db, userId: user.id }
}

export async function createPartyAction(input: NewParty) {
  const { db, userId } = await admin()
  const res = await createParty(db, input, userId)
  if (res.ok) { revalidatePath("/admin/tickets"); revalidatePath("/events") }
  return res
}

export async function updatePartyAction(id: string, f: Parameters<typeof updateParty>[2]) {
  const { db } = await admin()
  const res = await updateParty(db, id, f)
  revalidatePath(`/admin/tickets/${id}`)
  revalidatePath("/events")
  return res
}

export async function refundOrderAction(partyId: string, orderId: string) {
  const { db } = await admin()
  const res = await refundOrder(db, orderId)
  revalidatePath(`/admin/tickets/${partyId}`)
  return res
}

export async function cancelPartyAction(id: string) {
  const { db } = await admin()
  const res = await cancelParty(db, id)
  revalidatePath(`/admin/tickets/${id}`)
  revalidatePath("/admin/tickets")
  revalidatePath("/events")
  return res
}

/** Removes a cancelled party from the list (its refunds stay in Stripe). */
export async function deletePartyAction(id: string) {
  const { db } = await admin()
  const { data } = await db.from("ticketed_events").select("status").eq("id", id).single()
  if ((data as { status: string } | null)?.status !== "cancelled") return { ok: false, error: "Only a cancelled party can be deleted." }
  await db.from("ticketed_events").delete().eq("id", id)
  revalidatePath("/admin/tickets")
  return { ok: true }
}
