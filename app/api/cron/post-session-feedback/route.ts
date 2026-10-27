import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { sendFounderMessage } from "@/lib/resend/email"
import { sendReviewRequestSms } from "@/lib/telnyx/sms"
import { logEvent, logFailure } from "@/lib/observability/notify"

export const runtime = "nodejs"

// How long after a session ends before nudging for feedback/a review - long
// enough that the customer has actually left and isn't mid-drive-home, short
// enough the round is still fresh. Window width (not a single instant)
// covers the gap between cron ticks (every 15 min, see vercel.json) without
// relying on exact timing - feedback_email_sent_at is what actually
// guarantees a single send, this window just bounds the query.
const DELAY_MINUTES = 60
const WINDOW_MINUTES = 30

// Reply-to for "just reply to this email" - Jerrod's call 2026-08-31.
const FEEDBACK_REPLY_TO = "info@tee365.org"

const GOOGLE_REVIEW_URL = "https://g.page/r/Cfqp3OPwaMWgEBM/review"

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = await createServiceClient()

  const now = new Date()
  const windowEnd = new Date(now.getTime() - DELAY_MINUTES * 60 * 1000)
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MINUTES * 60 * 1000)

  const { data: sessions, error } = await serviceClient
    .from("bookings")
    .select("id, user_id, ends_at, bays(name), profiles!user_id(first_name, phone, sms_consent, review_sms_sent_at, google_review_at)")
    .eq("status", "confirmed")
    .is("feedback_email_sent_at", null)
    // One feedback email per group: the second bay of a two-bay booking is
    // the same customer and the same session.
    .is("parent_booking_id", null)
    .gte("ends_at", windowStart.toISOString())
    .lt("ends_at", windowEnd.toISOString())

  if (error) {
    console.error("[cron/post-session-feedback] query error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { id: string; sent: boolean; error?: string }[] = []

  for (const booking of sessions ?? []) {
    const bay = booking.bays as { name: string } | null
    const profile = booking.profiles as {
      first_name: string; phone: string | null; sms_consent: boolean
      review_sms_sent_at: string | null; google_review_at: string | null
    } | null

    // One review text per customer, ever (Jerrod 2026-10-27): first-timers
    // after their first session, regulars after their next one, and never
    // anyone who already left a Google review or didn't consent to texts.
    // Runs before the email so a missing email address doesn't skip it.
    if (profile?.phone && profile.sms_consent && !profile.review_sms_sent_at && !profile.google_review_at) {
      // Claim first: only the run that flips the column sends, so two
      // overlapping bookings can't double-text the same person.
      const { data: claimed } = await serviceClient
        .from("profiles")
        .update({ review_sms_sent_at: new Date().toISOString() })
        .eq("id", booking.user_id)
        .is("review_sms_sent_at", null)
        .select("id")
      if (claimed?.length) {
        try {
          await sendReviewRequestSms({ to: profile.phone, firstName: profile.first_name ?? "there", reviewUrl: GOOGLE_REVIEW_URL })
        } catch (e) {
          await logFailure(serviceClient, "review-request-sms-FAILED",
            `booking=${booking.id} user=${booking.user_id} err=${String(e).slice(0, 200)}`)
        }
      }
    }

    const { data: { user: authUser } } = await serviceClient.auth.admin.getUserById(booking.user_id)
    if (!authUser?.email) {
      results.push({ id: booking.id, sent: false, error: "no email on file" })
      continue
    }

    try {
      await sendFounderMessage({
        to: authUser.email,
        firstName: profile?.first_name ?? "there",
        subject: "How was your round at Tee365?",
        heading: "Thanks for playing!",
        paragraphs: [
          `Hope you had a great session${bay ? ` in ${bay.name}` : ""}. We're a brand new spot and still fine-tuning everything, so if anything felt off, hit any snags, or you've just got thoughts on how we could make it better, hit reply and tell me directly.`,
          "And if you had a good time, a Google review genuinely helps us out more than almost anything else right now.",
        ],
        ctaText: "Leave us a review",
        ctaUrl: GOOGLE_REVIEW_URL,
        replyTo: FEEDBACK_REPLY_TO,
        kind: "feedback",
      })
      await serviceClient
        .from("bookings")
        .update({ feedback_email_sent_at: new Date().toISOString() })
        .eq("id", booking.id)
      await logEvent(serviceClient, "post-session-feedback-sent", `booking=${booking.id} to=${authUser.email}`)
      results.push({ id: booking.id, sent: true })
    } catch (e) {
      results.push({ id: booking.id, sent: false, error: String(e).slice(0, 200) })
      await logFailure(serviceClient, "post-session-feedback-FAILED",
        `booking=${booking.id} to=${authUser.email} err=${String(e).slice(0, 200)}`)
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
