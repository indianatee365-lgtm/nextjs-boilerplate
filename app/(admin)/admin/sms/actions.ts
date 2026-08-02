"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { sendAdminReplySms } from "@/lib/telnyx/sms"

async function requireAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Unauthorized")
  return { user, serviceClient }
}

export async function sendReply(formData: FormData): Promise<void> {
  const { serviceClient } = await requireAdmin()

  const phone = (formData.get("phone") as string)?.trim()
  const body = (formData.get("body") as string)?.trim()
  if (!phone || !body) throw new Error("Missing phone or message")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  await sendAdminReplySms(phone, body)
  await db.from("sms_messages").insert({
    phone_number: phone,
    direction: "outbound",
    body,
  })
  // Replying counts as having seen the conversation - clear any unread flag.
  await db
    .from("sms_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("phone_number", phone)
    .is("read_at", null)

  revalidatePath("/admin/sms")
}
