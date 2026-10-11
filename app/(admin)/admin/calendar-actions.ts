"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { dayDetail, monthOverview } from "@/lib/admin/calendar"

async function adminDb() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).single()
  if ((p as { role: string } | null)?.role !== "admin") throw new Error("Admins only")
  return db
}

export async function monthOverviewAction(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Bad month")
  return monthOverview(await adminDb(), month)
}

export async function dayDetailAction(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("Bad date")
  return dayDetail(await adminDb(), dateKey)
}
