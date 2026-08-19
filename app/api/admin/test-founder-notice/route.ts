import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { sendFoundersDayPersonalNotice } from "@/lib/telnyx/sms"
import { sendFounderMessage } from "@/lib/resend/email"

// TEMPORARY - dry-run route for the 8/29 founder announcement, sends the
// exact same content the real cron will send tomorrow, but only to the
// calling admin. Delete after the dry run is confirmed.
export async function POST() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role, first_name, phone, sms_consent")
    .eq("id", user.id)
    .single()

  const p = profile as { role: string; first_name: string; phone: string | null; sms_consent: boolean } | null
  if (p?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: "No email on this account" }, { status: 400 })

  const results: Record<string, string> = {}

  try {
    await sendFounderMessage({
      to: user.email,
      firstName: p.first_name,
      subject: "Your 2 free hours for Founders & Friends Day (Aug 29)",
      heading: "Founders &amp; Friends Day is August 29",
      paragraphs: [
        "Thank you for investing in Tee365. As a founding member, you're the reason this place exists before anyone else even knows about it.",
        "Founders &amp; Friends Day is Saturday, August 29th, and it's yours. Your booking window is open now, so grab at least your 2 free hours if you can make it.",
        "I'll be onsite most of the day, so stop by and say hello. I'd love to meet you in person.",
        "If the 29th doesn't work for you, no pressure. Those hours don't expire, so use them whenever fits.",
        "One more thing: we want you to be our most vocal partners. Before we open to the public, if anything needs fixing, tell us. That's exactly what this day is for.",
      ],
      ctaText: "Book your free hours",
      ctaUrl: "https://tee365.org/book",
    })
    results.email = "sent to " + user.email
  } catch (e) {
    results.email = "FAILED: " + String(e).slice(0, 300)
  }

  if (p.phone && p.sms_consent) {
    try {
      await sendFoundersDayPersonalNotice({ to: p.phone, firstName: p.first_name })
      results.sms = "sent to " + p.phone
    } catch (e) {
      results.sms = "FAILED: " + String(e).slice(0, 300)
    }
  } else {
    results.sms = "skipped - no phone/sms_consent on this account"
  }

  return NextResponse.json(results)
}
