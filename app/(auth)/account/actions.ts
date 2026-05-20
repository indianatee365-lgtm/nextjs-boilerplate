"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return phone.startsWith("+") ? phone : "+" + phone
}

export async function updateProfile({
  firstName,
  lastName,
  phone,
  smsConsent,
}: {
  firstName: string
  lastName: string
  phone: string
  smsConsent: boolean
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const serviceClient = await createServiceClient()
  const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : null

  const { error } = await serviceClient.from("profiles").update({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    phone: normalizedPhone,
    sms_consent: normalizedPhone ? smsConsent : false,
  }).eq("id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/account")
  return {}
}

export async function updateEmail(email: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ email: email.trim() })
  if (error) return { error: error.message }
  return {}
}
