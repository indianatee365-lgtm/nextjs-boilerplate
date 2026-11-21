import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"
import { getSegmentRecipients, isAudienceSegment, SEGMENT_LABELS } from "@/lib/admin/audience"
import { sendCampaignBatch, BATCH_SIZE } from "@/lib/resend/campaign"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Sends email_campaigns rows with status "scheduled" once scheduled_for has
 * passed (Jerrod 2026-11-20: queue a campaign to go out while he sleeps).
 * Triggered every 15 minutes by Supabase pg_cron job "scheduled-campaigns".
 *
 * Same safety rules as the admin Send button (app/(admin)/admin/audience/actions.ts):
 * - the row is claimed scheduled -> sending in one conditional update, so two
 *   overlapping runs can never both send it;
 * - campaign_flags gets the campaign key (primary key), a second hard gate;
 * - each batch's recipients are claimed in campaign_sends BEFORE sending, so a
 *   crash can only under-send, never double-send.
 * Jerrod gets a text with the result either way.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  const { data: due, error } = await db.from("email_campaigns")
    .select("id, campaign_key, name, segment, subject, body")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { campaign: string; sent: number; failed: number; skipped?: string }[] = []

  for (const c of (due ?? []) as { id: string; campaign_key: string; name: string; segment: string; subject: string; body: string }[]) {
    const { data: claimed } = await db.from("email_campaigns")
      .update({ status: "sending" }).eq("id", c.id).eq("status", "scheduled").select("id")
    if (!claimed?.length) continue

    if (!isAudienceSegment(c.segment)) {
      await db.from("email_campaigns").update({ status: "failed" }).eq("id", c.id)
      await notifyOwner(`Scheduled email "${c.name}" NOT sent: unknown audience "${c.segment}".`)
      results.push({ campaign: c.campaign_key, sent: 0, failed: 0, skipped: "bad segment" })
      continue
    }

    const { error: flagError } = await db.from("campaign_flags").insert({ campaign: c.campaign_key })
    if (flagError) {
      await db.from("email_campaigns").update({ status: "failed" }).eq("id", c.id)
      await logFailure(serviceClient, "scheduled-campaign-flag-FAILED", `campaign=${c.campaign_key} err=${flagError.message}`,
        `Scheduled email "${c.name}" NOT sent: it looks like it was already started (${flagError.code}). Check /admin/audience.`)
      results.push({ campaign: c.campaign_key, sent: 0, failed: 0, skipped: "flag exists" })
      continue
    }

    let recipients
    try {
      recipients = await getSegmentRecipients(c.segment)
    } catch (e) {
      await db.from("email_campaigns").update({ status: "failed" }).eq("id", c.id)
      await logFailure(serviceClient, "scheduled-campaign-audience-FAILED", `campaign=${c.campaign_key} err=${String(e).slice(0, 200)}`,
        `Scheduled email "${c.name}" NOT sent: the audience list failed to load. Nobody was emailed.`)
      results.push({ campaign: c.campaign_key, sent: 0, failed: 0, skipped: "audience failed" })
      continue
    }
    await db.from("email_campaigns").update({ recipient_count: recipients.length }).eq("id", c.id)

    let sent = 0
    let failed = 0
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE)
      const { data: claimedRows, error: claimError } = await db.from("campaign_sends")
        .upsert(chunk.map((r) => ({ campaign: c.campaign_key, email: r.email })), { onConflict: "campaign,email", ignoreDuplicates: true })
        .select("email")
      if (claimError) {
        failed += chunk.length
        await logFailure(serviceClient, "campaign-claim-FAILED", `campaign=${c.campaign_key} size=${chunk.length} err=${claimError.message.slice(0, 200)}`)
        continue
      }
      const claimedEmails = new Set(((claimedRows ?? []) as { email: string }[]).map((x) => x.email))
      const toSend = chunk.filter((r) => claimedEmails.has(r.email))
      if (toSend.length === 0) continue
      try {
        await sendCampaignBatch({ messages: toSend.map((r) => ({ to: r.displayEmail, firstName: r.firstName })), subject: c.subject, body: c.body })
        sent += toSend.length
      } catch (e) {
        failed += toSend.length
        await logFailure(serviceClient, "campaign-batch-FAILED", `campaign=${c.campaign_key} size=${toSend.length} err=${String(e).slice(0, 200)}`)
      }
    }

    await db.from("email_campaigns").update({
      status: failed > 0 ? "sent_with_errors" : "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
    }).eq("id", c.id)
    await logEvent(serviceClient, "campaign-sent",
      `campaign=${c.campaign_key} name=${c.name} segment=${c.segment} (${SEGMENT_LABELS[c.segment]}) recipients=${recipients.length} sent=${sent} failed=${failed} scheduled=1`)
    await notifyOwner(failed > 0
      ? `Scheduled email "${c.name}" went out with errors: ${sent} sent, ${failed} failed. Check /admin/logs.`
      : `Scheduled email "${c.name}" sent to ${sent} people.`)
    results.push({ campaign: c.campaign_key, sent, failed })
  }

  return NextResponse.json({ processed: results.length, results })
}
