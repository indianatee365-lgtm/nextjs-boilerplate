import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const CAMPAIGN = "email_b_prelaunch"
const LOGO = "https://tee365.org/email-logo-v3.png"
const BTN = "display:block;background:#00A651;color:#000000;font-size:14px;font-weight:700;text-align:center;padding:14px 28px;border-radius:8px;text-decoration:none;"
const BTN_GHOST = "display:block;background:transparent;color:#00A651;font-size:14px;font-weight:700;text-align:center;padding:13px 28px;border-radius:8px;text-decoration:none;border:1px solid #00A651;"
const BASE = `*{margin:0;padding:0;box-sizing:border-box}body{background:#05070c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb}.wrap{background:#05070c;padding:40px 20px}.container{max-width:600px;margin:0 auto;background:linear-gradient(180deg,#05070c,#070b12);border:1px solid rgba(255,255,255,.14)}.header{padding:24px 20px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center}.hero{padding:36px 40px 32px;border-bottom:1px solid rgba(255,255,255,.06)}.eyebrow{font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:10px}.hero-title{font-size:28px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:14px}.hero-sub{font-size:15px;color:#9ca3af;line-height:1.8}.block{padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06)}.block-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:14px}.block-title{font-size:22px;font-weight:700;color:#fff;margin-bottom:12px}.block-body{font-size:14px;color:#9ca3af;line-height:1.8;margin-bottom:20px}.block-body strong{color:#fff}.code-box{background:#0a1a0a;border:2px solid #00A651;border-radius:10px;padding:28px 20px;text-align:center;margin-bottom:8px}.code-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px}.code{font-size:36px;font-weight:900;color:#00A651;letter-spacing:6px;font-family:monospace}.code-sub{font-size:12px;color:#6b7280;margin-top:10px}.sig{padding:28px 40px;border-bottom:1px solid rgba(255,255,255,.06)}.sig-name{font-size:15px;font-weight:600;color:#fff;font-style:italic}.sig-title{font-size:11px;color:#00A651;letter-spacing:.15em;text-transform:uppercase;margin-top:4px}.footer{padding:18px 40px;text-align:center}.footer-text{font-size:11px;color:#374151;line-height:1.8}.footer-text a{color:#4b5563;text-decoration:underline}`

function buildHtml(name: string, unsubToken: string): string {
  const unsub = `https://tee365.org/api/unsubscribe?token=${unsubToken}`
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Tee365 — September 2026</title><style>${BASE}</style></head><body>
<div class="wrap"><table class="container" width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td class="header"><img src="${LOGO}" width="210" height="210" alt="Tee365 Mishawaka" style="display:inline-block;"></td></tr>
  <tr><td class="hero">
    <div class="eyebrow">Early access</div>
    <div class="hero-title">This is what early access is all about, ${name}.</div>
    <div class="hero-sub">You signed up before we had a sign on the door. Before we had keys to the building. We open in September 2026 — and <strong style="color:#fff;">you get there first.</strong><br><br>Here's your head start.</div>
  </td></tr>
  <tr><td class="block">
    <div class="block-label">Your early access reward</div>
    <div class="block-title">$10 off your first booking.</div>
    <div class="block-body">No strings. No membership required. Book any bay, any time — use this code at checkout and $10 comes off your first session automatically.</div>
    <div class="code-box">
      <div class="code-label">Your promo code</div>
      <div class="code">EARLYACCESS10</div>
      <div class="code-sub">$10 off your first booking &nbsp;&middot;&nbsp; expires October 31, 2026</div>
    </div>
    <p style="font-size:12px;color:#4b5563;text-align:center;margin:10px 0 22px;">One use per account. Applied at checkout on tee365.org.</p>
    <a href="https://tee365.org/book" style="${BTN}">Book Your First Session &rarr;</a>
  </td></tr>
  <tr><td class="block">
    <div class="block-label">One more thing</div>
    <div class="block-title">Founder's Club.</div>
    <div class="block-body">If you've been thinking about a founding membership — now's the time. Founder's Club locks in your rate for life: <strong>30% off year one, 20% off forever</strong>. Once the 100 spots are gone, founding pricing closes permanently.</div>
    <a href="https://tee365.org/founders" style="${BTN_GHOST}">View Founder's Club &rarr;</a>
  </td></tr>
  <tr><td class="sig">
    <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:20px;">Almost there. I'll see you on the other side.</p>
    <div class="sig-name">Jerrod</div>
    <div class="sig-title">Founder, Tee365</div>
  </td></tr>
  <tr><td class="footer"><p class="footer-text">You're receiving this because you signed up at <a href="https://tee365.org">tee365.org</a>.<br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545<br><br><a href="https://tee365.org">Visit our site</a> &nbsp;&middot;&nbsp; <a href="${unsub}">Unsubscribe</a></p></td></tr>
</table></div></body></html>`
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Get all eligible waitlist members
  const { data: all } = await supabase
    .from("waitlist")
    .select("email, first_name, unsubscribe_token")
    .is("unsubscribed_at", null)

  if (!all?.length) return NextResponse.json({ sent: 0, skipped: 0 })

  // Find who hasn't been sent this campaign yet
  const { data: alreadySent } = await supabase
    .from("campaign_sends")
    .select("email")
    .eq("campaign", CAMPAIGN)

  const sentSet = new Set((alreadySent ?? []).map(r => r.email.toLowerCase()))
  const pending = all.filter(r => !sentSet.has(r.email.toLowerCase()))

  if (!pending.length) {
    return NextResponse.json({ sent: 0, skipped: all.length, message: "All already sent" })
  }

  // Insert campaign_sends records FIRST — unique constraint prevents any double-send
  // ON CONFLICT DO NOTHING means if two invocations race, only one wins per address
  const inserts = pending.map(r => ({ campaign: CAMPAIGN, email: r.email }))
  const { data: inserted } = await supabase
    .from("campaign_sends")
    .insert(inserts)
    .select("email")
    .onConflict("campaign, email")

  // Only send to addresses we successfully claimed
  const claimedEmails = new Set((inserted ?? []).map(r => r.email.toLowerCase()))
  const toSend = pending.filter(r => claimedEmails.has(r.email.toLowerCase()))

  if (!toSend.length) {
    return NextResponse.json({ sent: 0, skipped: all.length, message: "No new claims" })
  }

  // Build batch payload for Resend — one API call, no timeout risk
  const batch = toSend.map(r => ({
    from: "Jerrod | Tee365 <jerrod@tee365.org>",
    to: [r.email],
    subject: "Two weeks. Then we open. Here's $10 off.",
    html: buildHtml(r.first_name?.trim() || "there", r.unsubscribe_token ?? ""),
  }))

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batch),
  })

  if (!res.ok) {
    const err = await res.text()
    // On Resend failure, remove the campaign_sends records so we can retry
    await supabase
      .from("campaign_sends")
      .delete()
      .eq("campaign", CAMPAIGN)
      .in("email", toSend.map(r => r.email))
    return NextResponse.json({ error: `Resend batch failed: ${err}` }, { status: 500 })
  }

  return NextResponse.json({
    sent: toSend.length,
    skipped: all.length - toSend.length,
  })
}
