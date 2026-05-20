"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendGiftCardEmail } from "@/lib/resend/email"
import { randomBytes } from "crypto"

function generateCode(): string {
  return randomBytes(6).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
}

export async function issueGiftCard({
  amount,
  recipientName,
  recipientEmail,
  sendEmail,
}: {
  amount: number
  recipientName: string | null
  recipientEmail: string | null
  sendEmail: boolean
}) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: profile } = await serviceClient.from("profiles").select("role, first_name").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")

  const code = generateCode()

  await serviceClient.from("gift_cards").insert({
    code,
    original_amount: amount,
    balance: amount,
    active: true,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    purchased_by: (profile as { first_name: string } | null)?.first_name ?? "Tee365",
  })

  if (sendEmail && recipientEmail && recipientName) {
    await sendGiftCardEmail({
      recipientEmail,
      recipientName,
      senderName: "Tee365",
      code,
      amount,
    })
  }
}

export async function deactivateGiftCard(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") return { error: "Forbidden" }

  const { error } = await serviceClient
    .from("gift_cards")
    .update({ active: false })
    .eq("id", id)

  if (error) return { error: error.message }
  return {}
}
