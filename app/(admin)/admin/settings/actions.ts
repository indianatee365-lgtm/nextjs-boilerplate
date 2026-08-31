"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")
  return { serviceClient }
}

export async function setAdminSetting(key: string, value: boolean) {
  const { serviceClient } = await assertAdmin()
  await serviceClient
    .from("admin_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() })
  revalidatePath("/admin/settings")
}
