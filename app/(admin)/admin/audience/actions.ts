"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { requireAdmin } from "@/lib/admin/guard"
import { logEvent, logFailure } from "@/lib/observability/notify"
import { getSegmentRecipients, isAudienceSegment, SEGMENT_LABELS } from "@/lib/admin/audience"
import { sendCampaignBatch, sendCampaignTest, BATCH_SIZE } from "@/lib/resend/campaign"

/**
 * Send the campaign to the admin's own address first. Not optional in practice:
 * this is free text going to hundreds of people, and the only way to know the
 * markup rendered the way you meant is to look at the actual email.
 */
export async function sendTest(formData: FormData): Promise<void> {
  const { user, serviceClient } = await requireAdmin()

  const subject = (formData.get("subject") as string)?.trim()
  const body = (formData.get("body") as string)?.trim()
  if (!subject || !body) throw new Error("Missing subject or body")
  if (!user.email) throw new Error("Your admin account has no email address")

  const { data: profile } = await serviceClient
    .from("profiles").select("first_name").eq("id", user.id).maybeSingle()

  await sendCampaignTest({
    to: user.email,
    firstName: (profile as { first_name: string | null } | null)?.first_name ?? null,
    subject,
    body,
  })

  const params = new URLSearchParams({
    name: (formData.get("name") as string) ?? "",
    segment: (formData.get("segment") as string) ?? "",
    subject,
    body,
    tested: "1",
  })
  redirect(`/admin/audience/new?${params.toString()}`)
}

export async function sendCampaign(formData: FormData): Promise<void> {
  const { user, serviceClient } = await requireAdmin()

  const name = (formData.get("name") as string)?.trim()
  const segment = formData.get("segment") as string
  const subject = (formData.get("subject") as string)?.trim()
  const body = (formData.get("body") as string)?.trim()
  const nonce = (formData.get("nonce") as string)?.trim()

  if (!name) throw new Error("Missing campaign name")
  if (!isAudienceSegment(segment)) throw new Error("Invalid segment")
  if (!subject || !body) throw new Error("Missing subject or body")
  if (!nonce) throw new Error("Missing confirmation token")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  // Same hard gate the SMS broadcast uses. The nonce is minted once when the
  // confirm screen renders, so a double-tapped or back-button resubmit shares
  // the key, and campaign_flags.campaign being the primary key means the second
  // attempt loses. A duplicate send to the whole list is the one failure this
  // tool must never have.
  const campaignKey = `email-${segment}-${nonce}`
  const { error: flagError } = await db.from("campaign_flags").insert({ campaign: campaignKey })
  if (flagError) {
    if (flagError.code === "23505") redirect("/admin/audience")
    throw new Error("Failed to start send: " + flagError.message)
  }

  const recipients = await getSegmentRecipients(segment)

  await db.from("email_campaigns").insert({
    campaign_key: campaignKey,
    name,
    segment,
    subject,
    body,
    status: "sending",
    created_by: user.id,
    recipient_count: recipients.length,
  })

  let sent = 0
  let failed = 0
  const failures: string[] = []

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE)

    // Claim before sending, never after. campaign_sends has a unique index on
    // (campaign, email), so this both records who we are about to mail and
    // filters out anyone a previous attempt already claimed. On 2026-06-06 a
    // poll-then-send loop double-sent a campaign; marking first is what stops
    // that, and it means a crash mid-run can only ever under-send, which is the
    // failure we can live with.
    const { data: claimed, error: claimError } = await db
      .from("campaign_sends")
      .upsert(
        chunk.map((r) => ({ campaign: campaignKey, email: r.email })),
        { onConflict: "campaign,email", ignoreDuplicates: true },
      )
      .select("email")

    if (claimError) {
      failed += chunk.length
      failures.push(`claim-failed:${chunk.length}`)
      await logFailure(serviceClient, "campaign-claim-FAILED",
        `campaign=${campaignKey} size=${chunk.length} err=${claimError.message.slice(0, 200)}`)
      continue
    }

    const claimedEmails = new Set(((claimed ?? []) as { email: string }[]).map((c) => c.email))
    const toSend = chunk.filter((r) => claimedEmails.has(r.email))
    if (toSend.length === 0) continue

    try {
      await sendCampaignBatch({
        messages: toSend.map((r) => ({ to: r.displayEmail, firstName: r.firstName })),
        subject,
        body,
      })
      sent += toSend.length
    } catch (e) {
      failed += toSend.length
      failures.push(...toSend.slice(0, 5).map((r) => r.email))
      // These stay claimed on purpose. Re-running would risk mailing the people
      // in this batch who did receive it, and Resend reports batch failures at
      // the request level, so we cannot tell which ones landed.
      await logFailure(serviceClient, "campaign-batch-FAILED",
        `campaign=${campaignKey} size=${toSend.length} err=${String(e).slice(0, 200)}`,
        `Campaign "${name}" had a batch of ${toSend.length} fail. ${sent} sent so far. Check admin logs.`)
    }
  }

  await db
    .from("email_campaigns")
    .update({
      status: failed > 0 ? "sent_with_errors" : "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
    })
    .eq("campaign_key", campaignKey)

  after(() =>
    logEvent(serviceClient, "campaign-sent",
      `campaign=${campaignKey} name=${name} segment=${segment} (${SEGMENT_LABELS[segment]}) ` +
      `recipients=${recipients.length} sent=${sent} failed=${failed}` +
      (failures.length ? ` failures=${failures.join(",")}` : "")),
  )

  revalidatePath("/admin/audience")
  redirect("/admin/audience")
}

/** Manually suppress an address, for someone who asks to be removed by phone. */
export async function optOutEmail(formData: FormData): Promise<void> {
  const { serviceClient } = await requireAdmin()
  const email = (formData.get("email") as string)?.trim().toLowerCase()
  if (!email) throw new Error("Missing email")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any
  await db.from("email_opt_outs").upsert({ email, source: "admin" }, { onConflict: "email" })
  await logEvent(serviceClient, "email-opt-out-admin", `email=${email}`)

  revalidatePath("/admin/audience")
}
