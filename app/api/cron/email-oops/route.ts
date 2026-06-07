import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const LOGO = "https://tee365.org/email-logo-v3.png"
const SUBJECT = "Oops, we got a little too excited."
const UNSUBSCRIBE_BASE = "https://tee365.org/api/unsubscribe?token="

const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{background:#05070c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb}.wrap{background:#05070c;padding:40px 20px}.container{max-width:600px;margin:0 auto;background:linear-gradient(180deg,#05070c,#070b12);border:1px solid rgba(255,255,255,.14)}.header{padding:24px 20px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center}.body{padding:36px 40px}.eyebrow{font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:18px}.hero-title{font-size:26px;font-weight:700;color:#fff;line-height:1.25;margin-bottom:22px}.p{font-size:15px;color:#9ca3af;line-height:1.85;margin-bottom:18px}.p strong{color:#fff}.code-box{background:#0a1a0a;border:2px solid #00A651;border-radius:10px;padding:24px 20px;text-align:center;margin:24px 0}.code-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.15em;margin-bottom:10px}.code{font-size:34px;font-weight:900;color:#00A651;letter-spacing:6px;font-family:monospace}.code-sub{font-size:12px;color:#6b7280;margin-top:8px}.sig{padding:28px 40px;border-top:1px solid rgba(255,255,255,.06)}.sig-name{font-size:15px;font-weight:600;color:#fff;font-style:italic}.sig-title{font-size:11px;color:#00A651;letter-spacing:.15em;text-transform:uppercase;margin-top:4px}.footer{padding:18px 40px;text-align:center}.footer-text{font-size:11px;color:#374151;line-height:1.8}.footer-text a{color:#4b5563;text-decoration:underline}`

function buildHtml(name: string, unsubToken: string): string {
  const unsub = UNSUBSCRIBE_BASE + unsubToken
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${SUBJECT}</title><style>${CSS}</style></head><body>
<div class="wrap"><table class="container" width="100%" cellpadding="0" cellspacing="0" role="presentation">

  <tr><td class="header">
    <img src="${LOGO}" width="150" height="150" alt="Tee365 Mishawaka" style="display:inline-block;">
  </td></tr>

  <tr><td class="body">
    <div class="eyebrow">A note from Jerrod</div>
    <div class="hero-title">Yeah, we jumped the gun.</div>
    <p class="p">You got an email from us yesterday with the subject "Two weeks. Then we open." That was supposed to be a preview we sent to ourselves before approving it. We got a little excited and hit send way too early. Opening day is still <strong>September 2026</strong>, not two weeks from now.</p>
    <p class="p">The good news: everything else in that email is real. Your promo code is live and locked in:</p>
    <div class="code-box">
      <div class="code-label">Your early access code</div>
      <div class="code">EARLYACCESS10</div>
      <div class="code-sub">$10 off your first booking &nbsp;·&nbsp; expires October 31, 2026</div>
    </div>
    <p class="p">You won't be able to use it until the booking window opens, but we'll reach out the moment it does, and your code will be ready to go.</p>
    <p class="p">We've been putting a lot of work into this place and honestly, we're just pumped. Too pumped, apparently. Thanks for being on the list. See you in September.</p>
  </td></tr>

  <tr><td class="sig">
    <div class="sig-name">Jerrod</div>
    <div class="sig-title">Founder, Tee365</div>
  </td></tr>

  <tr><td class="footer">
    <p class="footer-text">
      You're receiving this because you signed up at <a href="https://tee365.org">tee365.org</a>.<br>
      Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545<br><br>
      <a href="https://tee365.org">Visit our site</a> &nbsp;&middot;&nbsp; <a href="${unsub}">Unsubscribe</a>
    </p>
  </td></tr>

</table></div></body></html>`
}

// GET ?preview=1 — renders HTML directly in browser (no auth, preview only)
// GET ?test=1    — sends to m20thesailorman@gmail.com only
// GET (default)  — requires CRON_SECRET, sends to full waitlist
export async function GET(request: NextRequest) {
  const preview = request.nextUrl.searchParams.get("preview") === "1"
  const test = request.nextUrl.searchParams.get("test") === "1"

  if (preview) {
    const html = buildHtml("Jerrod", "preview-token")
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
  }

  const auth = request.headers.get("authorization") ?? ""
  if (!test && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()

  if (test) {
    const { data: me } = await supabase
      .from("waitlist")
      .select("first_name, unsubscribe_token")
      .eq("email", "m20thesailorman@gmail.com")
      .single()
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Jerrod | Tee365 <jerrod@tee365.org>",
        to: ["m20thesailorman@gmail.com"],
        subject: SUBJECT,
        html: buildHtml(me?.first_name?.trim() || "Jerrod", me?.unsubscribe_token ?? ""),
      }),
    })
    return NextResponse.json({ test: true, ok: res.ok })
  }

  // Production send — full waitlist, no re-send guard needed (this is a one-off correction)
  const { data: all } = await supabase
    .from("campaign_sends")
    .select("email")
    .eq("campaign", "email_b_prelaunch")

  if (!all?.length) return NextResponse.json({ sent: 0 })

  const { data: waitlist } = await supabase
    .from("waitlist")
    .select("email, first_name, unsubscribe_token")
    .in("email", all.map(r => r.email))
    .is("unsubscribed_at", null)

  if (!waitlist?.length) return NextResponse.json({ sent: 0 })

  const batch = waitlist.map(r => ({
    from: "Jerrod | Tee365 <jerrod@tee365.org>",
    to: [r.email],
    subject: SUBJECT,
    html: buildHtml(r.first_name?.trim() || "there", r.unsubscribe_token ?? ""),
  }))

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ sent: waitlist.length })
}
