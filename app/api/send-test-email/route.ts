import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

// TEMPORARY — delete after email previews approved
export async function POST(req: NextRequest) {
  const { email: which } = await req.json()

  const supabase = await createServiceClient()
  const { data: me } = await supabase
    .from("waitlist")
    .select("first_name, unsubscribe_token")
    .eq("email", "m20thesailorman@gmail.com")
    .single()

  const { data: founders } = await supabase
    .from("memberships")
    .select("id", { count: "exact" })
    .eq("status", "active")

  const foundersCount = founders?.length ?? 0
  const remaining = 100 - foundersCount
  const firstName = me?.first_name ?? "Jerrod"
  const token = me?.unsubscribe_token ?? ""
  const unsub = `https://tee365.org/api/unsubscribe?token=${token}`

  let html = ""
  let subject = ""

  if (which === "a") {
    subject = "Before anyone else — Founder's Club is open."
    html = buildEmailA(firstName, unsub)
  } else {
    subject = "Two weeks. Then we open. Here's $10 off."
    html = buildEmailB(firstName, unsub, remaining)
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Jerrod | Tee365 <jerrod@tee365.org>",
      to: ["m20thesailorman@gmail.com"],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return NextResponse.json({ error: body }, { status: 500 })
  }

  return NextResponse.json({ ok: true, foundersCount, remaining })
}

function buildEmailA(name: string, unsub: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tee365</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}body{background:#05070c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb}
  .wrap{background:#05070c;padding:40px 20px}.container{max-width:600px;margin:0 auto;background:linear-gradient(180deg,#05070c,#070b12);border:1px solid rgba(255,255,255,.14)}
  .header{padding:28px 40px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center}
  .hero{padding:36px 40px 28px;border-bottom:1px solid rgba(255,255,255,.06)}
  .eyebrow{font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:10px}
  .hero-title{font-size:28px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:12px}
  .hero-sub{font-size:15px;color:#9ca3af;line-height:1.7}
  .block{padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06)}
  .block-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:14px}
  .block-title{font-size:22px;font-weight:700;color:#fff;margin-bottom:10px}
  .block-body{font-size:14px;color:#9ca3af;line-height:1.8;margin-bottom:20px}
  .block-body strong{color:#fff}
  .perks{background:rgba(0,166,81,.06);border:1px solid rgba(0,166,81,.2);border-radius:8px;padding:18px 20px;margin-bottom:22px}
  .perk{font-size:13px;color:#9ca3af;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)}
  .perk:last-child{border-bottom:none}.perk strong{color:#00A651}
  .cap-badge{display:inline-block;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#a3a3a3;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:5px 14px;border-radius:4px;margin-bottom:18px}
  .cta{display:block;background:#00A651;color:#fff;font-size:14px;font-weight:700;text-align:center;padding:14px 28px;border-radius:8px;text-decoration:none}
  .cta-ghost{display:block;background:transparent;color:#00A651;font-size:14px;font-weight:700;text-align:center;padding:13px 28px;border-radius:8px;text-decoration:none;border:1px solid #00A651}
  .discount-box{background:rgba(0,166,81,.08);border:1px solid rgba(0,166,81,.25);border-radius:8px;padding:20px;margin-bottom:22px;text-align:center}
  .discount-big{font-size:42px;font-weight:900;color:#00A651;line-height:1}
  .discount-label{font-size:12px;color:#9ca3af;margin-top:4px}
  .sig{padding:28px 40px;border-bottom:1px solid rgba(255,255,255,.06)}
  .sig-name{font-size:15px;font-weight:600;color:#fff;font-style:italic}
  .sig-title{font-size:11px;color:#00A651;letter-spacing:.15em;text-transform:uppercase;margin-top:4px}
  .footer{padding:18px 40px;text-align:center}
  .footer-text{font-size:11px;color:#374151;line-height:1.8}
  .footer-text a{color:#4b5563;text-decoration:underline}
</style></head><body>
<div class="wrap"><table class="container" width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td class="header"><img src="https://tee365.org/email-logo.png" width="150" height="150" alt="Tee365 Mishawaka" style="display:inline-block;"></td></tr>
  <tr><td class="hero">
    <div class="eyebrow">For early access members</div>
    <div class="hero-title">Two things worth knowing, ${name}.</div>
    <div class="hero-sub">You signed up before we opened our doors. Here's what's available to you right now — before the general public sees any of it.</div>
  </td></tr>
  <tr><td class="block">
    <div class="block-label">01 &nbsp;&mdash;&nbsp; Founding Membership</div>
    <div class="block-title">Be one of 100 Founders.</div>
    <div class="cap-badge">100 spots &nbsp;&middot;&nbsp; 4 claimed &nbsp;&middot;&nbsp; first come, first permanent</div>
    <div class="block-body">Tee365 opens September 1st. Founder's Club is the only membership tier that locks in your rate for life — as long as you stay active, your pricing never changes regardless of what rates do after launch.<br><br><strong>We've never announced this publicly.</strong> You're seeing it first.</div>
    <div class="perks">
      <div class="perk"><strong>30% off</strong> every session — all of year one</div>
      <div class="perk"><strong>20% off for life</strong> — locked in as long as you're a member</div>
      <div class="perk"><strong>48-hour head start</strong> — first booking access before anyone else</div>
      <div class="perk"><strong>21-day advance window</strong> — book 3 weeks out</div>
      <div class="perk"><strong>Founders &amp; Friends Day</strong> — 2 complimentary hours at a private pre-opening event</div>
      <div class="perk"><strong>Founders Wall</strong> — your name in the facility, permanent</div>
    </div>
    <a href="https://tee365.org/founders" class="cta">Become a Founding Member &rarr;</a>
  </td></tr>
  <tr><td class="block">
    <div class="block-label">02 &nbsp;&mdash;&nbsp; Gift Cards</div>
    <div class="block-title">Give golf. Get 20% off doing it.</div>
    <div class="block-body">Gift cards are live now at tee365.org. Through opening day, every gift card is <strong>20% off</strong> — a $100 card for $80, $50 for $40, $25 for $20. The recipient gets the full face value when they book.<br><br>Know a golfer? This is the move.</div>
    <div class="discount-box">
      <div class="discount-big">20% off</div>
      <div class="discount-label">all gift cards &nbsp;&middot;&nbsp; through opening day, Sept 1</div>
    </div>
    <a href="https://tee365.org/gift-cards" class="cta-ghost">Buy a Gift Card &rarr;</a>
  </td></tr>
  <tr><td class="sig">
    <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:20px;">Opening day is September 1st. We're building fast and you'll hear from me again before then — but only when there's something worth saying.</p>
    <div class="sig-name">Jerrod</div>
    <div class="sig-title">Founder, Tee365</div>
  </td></tr>
  <tr><td class="footer"><p class="footer-text">You're receiving this because you signed up at <a href="https://tee365.org">tee365.org</a>.<br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545<br><br><a href="https://tee365.org">Visit our site</a> &nbsp;&middot;&nbsp; <a href="${unsub}">Unsubscribe</a></p></td></tr>
</table></div></body></html>`
}

function buildEmailB(name: string, unsub: string, remaining: number): string {
  const foundersBlock = remaining <= 0
    ? `<div class="block-label">Founder's Club</div><div class="block-title">Founder's Club is full.</div><div class="block-body">All 100 founding spots have been claimed. If you're one of them — thank you. Your support before we even opened our doors is something we won't forget.<br><br>Birdie and Eagle memberships open one week before launch. Stay tuned.</div>`
    : `<div class="block-label">One more thing</div><div class="block-title">${remaining} Founder's Club spots left.</div><div class="block-body">If you've been thinking about it — now's the time. Founder's Club locks in your rate for life: <strong>30% off year one, 20% off forever</strong>. Once the 100 spots are gone, founding pricing closes permanently.</div><a href="https://tee365.org/founders" class="cta-ghost" style="margin-top:16px;">View Founder's Club &rarr;</a>`

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Tee365 opens September 1st</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}body{background:#05070c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb}
  .wrap{background:#05070c;padding:40px 20px}.container{max-width:600px;margin:0 auto;background:linear-gradient(180deg,#05070c,#070b12);border:1px solid rgba(255,255,255,.14)}
  .header{padding:28px 40px;border-bottom:1px solid rgba(255,255,255,.08);text-align:center}
  .hero{padding:36px 40px 32px;border-bottom:1px solid rgba(255,255,255,.06)}
  .eyebrow{font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:10px}
  .hero-title{font-size:28px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:14px}
  .hero-sub{font-size:15px;color:#9ca3af;line-height:1.8}.hero-sub strong{color:#fff}
  .block{padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06)}
  .block-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#00A651;margin-bottom:14px}
  .block-title{font-size:22px;font-weight:700;color:#fff;margin-bottom:12px}
  .block-body{font-size:14px;color:#9ca3af;line-height:1.8;margin-bottom:20px}.block-body strong{color:#fff}
  .code-box{background:#0a1a0a;border:2px solid #00A651;border-radius:10px;padding:28px 20px;text-align:center;margin-bottom:8px}
  .code-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.15em;margin-bottom:12px}
  .code{font-size:36px;font-weight:900;color:#00A651;letter-spacing:6px;font-family:monospace}
  .code-sub{font-size:12px;color:#6b7280;margin-top:10px}
  .cta{display:block;background:#00A651;color:#fff;font-size:14px;font-weight:700;text-align:center;padding:14px 28px;border-radius:8px;text-decoration:none}
  .cta-ghost{display:block;background:transparent;color:#00A651;font-size:14px;font-weight:700;text-align:center;padding:13px 28px;border-radius:8px;text-decoration:none;border:1px solid #00A651}
  .date-badge{display:inline-block;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.15);color:#fff;font-size:13px;font-weight:700;letter-spacing:.05em;padding:8px 18px;border-radius:6px;margin-bottom:20px}
  .sig{padding:28px 40px;border-bottom:1px solid rgba(255,255,255,.06)}
  .sig-name{font-size:15px;font-weight:600;color:#fff;font-style:italic}
  .sig-title{font-size:11px;color:#00A651;letter-spacing:.15em;text-transform:uppercase;margin-top:4px}
  .footer{padding:18px 40px;text-align:center}
  .footer-text{font-size:11px;color:#374151;line-height:1.8}.footer-text a{color:#4b5563;text-decoration:underline}
</style></head><body>
<div class="wrap"><table class="container" width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td class="header"><img src="https://tee365.org/email-logo.png" width="150" height="150" alt="Tee365 Mishawaka" style="display:inline-block;"></td></tr>
  <tr><td class="hero">
    <div class="eyebrow">Early access</div>
    <div class="date-badge">September 1, 2026 &nbsp;&middot;&nbsp; Opening Day</div>
    <div class="hero-title">This is what early access is all about, ${name}.</div>
    <div class="hero-sub">You signed up before we had a sign on the door. Before we had keys to the building. Two weeks from now, Tee365 opens to the public — but <strong>you get there first.</strong><br><br>Here's your head start.</div>
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
    <a href="https://tee365.org/book" class="cta">Book Your First Session &rarr;</a>
  </td></tr>
  <tr><td class="block">${foundersBlock}</td></tr>
  <tr><td class="sig">
    <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:20px;">Two weeks. Then the doors open. I'll see you on the other side.</p>
    <div class="sig-name">Jerrod</div>
    <div class="sig-title">Founder, Tee365</div>
  </td></tr>
  <tr><td class="footer"><p class="footer-text">You're receiving this because you signed up at <a href="https://tee365.org">tee365.org</a>.<br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545<br><br><a href="https://tee365.org">Visit our site</a> &nbsp;&middot;&nbsp; <a href="${unsub}">Unsubscribe</a></p></td></tr>
</table></div></body></html>`
}
