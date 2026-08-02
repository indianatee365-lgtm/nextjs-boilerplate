"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { sendAdminReplySms, sendBroadcastSms } from "@/lib/telnyx/sms"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { getGroupRecipients, isSmsGroup } from "@/lib/admin/sms-groups"

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return raw.startsWith("+") ? raw : "+" + raw
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

export async function sendIndividualMessage(formData: FormData): Promise<void> {
  const { serviceClient } = await requireAdmin()

  const rawPhone = (formData.get("phone") as string)?.trim()
  const body = (formData.get("body") as string)?.trim()
  if (!rawPhone || !body) throw new Error("Missing phone or message")
  const phone = normalizePhone(rawPhone)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  await sendAdminReplySms(phone, body)
  await db.from("sms_messages").insert({
    phone_number: phone,
    direction: "outbound",
    body,
  })

  revalidatePath("/admin/sms")
  redirect(`/admin/sms?phone=${encodeURIComponent(phone)}`)
}

export async function sendGroupMessage(formData: FormData): Promise<void> {
  const { serviceClient } = await requireAdmin()

  const group = formData.get("group") as string
  const nonce = (formData.get("nonce") as string)?.trim()
  const body = (formData.get("body") as string)?.trim()
  if (!isSmsGroup(group)) throw new Error("Invalid group")
  if (!body) throw new Error("Missing message")
  if (!nonce) throw new Error("Missing confirmation token")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  // Hard gate against double-submit (double-click, back-button resubmit).
  // The nonce is generated once when the confirm screen renders, so both
  // legs of a duplicate submission share the same campaign key - campaign_flags.campaign
  // is a primary key, so the second insert fails and this aborts silently.
  const campaign = `sms-broadcast-${group}-${nonce}`
  const { error: flagError } = await db.from("campaign_flags").insert({ campaign })
  if (flagError) {
    if (flagError.code === "23505") {
      redirect("/admin/sms")
    }
    throw new Error("Failed to start send: " + flagError.message)
  }

  const recipients = await getGroupRecipients(group)

  let sent = 0
  let failed = 0
  for (const r of recipients) {
    try {
      await sendBroadcastSms(r.phone, body)
      await db.from("sms_messages").insert({
        phone_number: r.phone,
        direction: "outbound",
        body,
      })
      sent++
    } catch (e) {
      await logFailure(serviceClient, "sms-broadcast-send-FAILED", `campaign=${campaign} to=${r.phone} err=${String(e).slice(0, 200)}`)
      failed++
    }
    // Small pause between sends to stay well under Telnyx/carrier throughput limits.
    await sleep(200)
  }

  await logEvent(serviceClient, "sms-broadcast-sent", `campaign=${campaign} group=${group} sent=${sent} failed=${failed} total=${recipients.length}`)

  revalidatePath("/admin/sms")
  redirect("/admin/sms")
}
