#!/usr/bin/env python3
"""
Email A — Founder's Club + Gift Cards live now
Send test: python3 email_a_founders_giftcards.py --test
Send all:  python3 email_a_founders_giftcards.py --send
"""

import sys
import json
import urllib.request
import os

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
UNSUBSCRIBE_BASE = "https://tee365.org/api/unsubscribe?token="

def build_html(first_name: str, unsubscribe_token: str) -> str:
    name = first_name.strip() if first_name else "there"
    unsub_url = UNSUBSCRIBE_BASE + unsubscribe_token
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tee365 — Founder's Club & Gift Cards</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ background-color: #05070c; font-family: Arial, Helvetica, sans-serif; color: #e5e7eb; }}
    .wrap {{ background-color: #05070c; padding: 40px 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #05070c, #070b12); border: 1px solid rgba(255,255,255,0.14); }}
    .header {{ padding: 28px 40px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: center; }}
    .hero {{ padding: 36px 40px 28px; border-bottom: 1px solid rgba(255,255,255,0.06); }}
    .eyebrow {{ font-size: 11px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #00A651; margin-bottom: 10px; }}
    .hero-title {{ font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.2; margin-bottom: 12px; }}
    .hero-sub {{ font-size: 15px; color: #9ca3af; line-height: 1.7; }}
    .block {{ padding: 32px 40px; border-bottom: 1px solid rgba(255,255,255,0.06); }}
    .block-label {{ font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #00A651; margin-bottom: 14px; }}
    .block-title {{ font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 10px; }}
    .block-body {{ font-size: 14px; color: #9ca3af; line-height: 1.8; margin-bottom: 20px; }}
    .block-body strong {{ color: #ffffff; }}
    .perks {{ background: rgba(0,166,81,0.06); border: 1px solid rgba(0,166,81,0.2); border-radius: 8px; padding: 18px 20px; margin-bottom: 22px; }}
    .perk {{ font-size: 13px; color: #9ca3af; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }}
    .perk:last-child {{ border-bottom: none; }}
    .perk strong {{ color: #00A651; }}
    .cap-badge {{ display: inline-block; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: #a3a3a3; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 5px 14px; border-radius: 4px; margin-bottom: 18px; }}
    .cta {{ display: block; background: #00A651; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; padding: 14px 28px; border-radius: 8px; text-decoration: none; }}
    .cta-ghost {{ display: block; background: transparent; color: #00A651; font-size: 14px; font-weight: 700; text-align: center; padding: 13px 28px; border-radius: 8px; text-decoration: none; border: 1px solid #00A651; }}
    .discount-box {{ background: rgba(0,166,81,0.08); border: 1px solid rgba(0,166,81,0.25); border-radius: 8px; padding: 20px; margin-bottom: 22px; text-align: center; }}
    .discount-big {{ font-size: 42px; font-weight: 900; color: #00A651; line-height: 1; }}
    .discount-label {{ font-size: 12px; color: #9ca3af; margin-top: 4px; }}
    .sig {{ padding: 28px 40px; border-bottom: 1px solid rgba(255,255,255,0.06); }}
    .sig-name {{ font-size: 15px; font-weight: 600; color: #ffffff; font-style: italic; }}
    .sig-title {{ font-size: 11px; color: #00A651; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 4px; }}
    .footer {{ padding: 18px 40px; text-align: center; }}
    .footer-text {{ font-size: 11px; color: #374151; line-height: 1.8; }}
    .footer-text a {{ color: #4b5563; text-decoration: underline; }}
  </style>
</head>
<body>
<div class="wrap">
  <table class="container" width="100%" cellpadding="0" cellspacing="0" role="presentation">

    <tr><td class="header">
      <img src="https://tee365.org/email-logo.png" width="150" height="150" alt="Tee365 Mishawaka" style="display:inline-block;">
    </td></tr>

    <tr><td class="hero">
      <div class="eyebrow">For early access members</div>
      <div class="hero-title">Two things worth knowing, {name}.</div>
      <div class="hero-sub">You signed up before we opened our doors. Here's what's available to you right now — before the general public sees any of it.</div>
    </td></tr>

    <!-- BLOCK 1: FOUNDER'S CLUB -->
    <tr><td class="block">
      <div class="block-label">01 &nbsp;—&nbsp; Founding Membership</div>
      <div class="block-title">Be one of 100 Founders.</div>
      <div class="cap-badge">100 spots &nbsp;·&nbsp; 0 claimed &nbsp;·&nbsp; first come, first permanent</div>
      <div class="block-body">
        Tee365 opens September 1st. Founder's Club is the only membership tier that locks in your rate for life — as long as you stay active, your pricing never changes regardless of what rates do after launch.
        <br><br>
        <strong>We've never announced this publicly.</strong> You're seeing it first.
      </div>
      <div class="perks">
        <div class="perk"><strong>30% off</strong> every session — all of year one</div>
        <div class="perk"><strong>20% off for life</strong> — locked in as long as you're a member</div>
        <div class="perk"><strong>48-hour head start</strong> — first booking access before anyone else</div>
        <div class="perk"><strong>21-day advance window</strong> — book 3 weeks out</div>
        <div class="perk"><strong>Founders & Friends Day</strong> — 2 complimentary hours at a private pre-opening event</div>
        <div class="perk"><strong>Founders Wall</strong> — your name in the facility, permanent</div>
      </div>
      <a href="https://tee365.org/founders" class="cta">Become a Founding Member &rarr;</a>
    </td></tr>

    <!-- BLOCK 2: GIFT CARDS -->
    <tr><td class="block">
      <div class="block-label">02 &nbsp;—&nbsp; Gift Cards</div>
      <div class="block-title">Give golf. Get 20% off doing it.</div>
      <div class="block-body">
        Gift cards are live now at tee365.org. Through opening day, every gift card is <strong>20% off</strong> — a $100 card for $80, $50 for $40, $25 for $20. The recipient gets the full face value when they book.
        <br><br>
        Know a golfer? This is the move.
      </div>
      <div class="discount-box">
        <div class="discount-big">20% off</div>
        <div class="discount-label">all gift cards &nbsp;·&nbsp; through opening day, Sept 1</div>
      </div>
      <a href="https://tee365.org/gift-cards" class="cta-ghost">Buy a Gift Card &rarr;</a>
    </td></tr>

    <!-- SIGN OFF -->
    <tr><td class="sig">
      <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:20px;">
        Opening day is September 1st. We're building fast and you'll hear from me again before then — but only when there's something worth saying.
      </p>
      <div class="sig-name">Jerrod</div>
      <div class="sig-title">Founder, Tee365</div>
    </td></tr>

    <tr><td class="footer">
      <p class="footer-text">
        You're receiving this because you signed up at <a href="https://tee365.org">tee365.org</a>.<br>
        Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545<br><br>
        <a href="https://tee365.org">Visit our site</a> &nbsp;&middot;&nbsp; <a href="{unsub_url}">Unsubscribe</a>
      </p>
    </td></tr>

  </table>
</div>
</body>
</html>"""


def send(to_email: str, first_name: str, unsubscribe_token: str):
    html = build_html(first_name, unsubscribe_token)
    payload = json.dumps({
        "from": "Jerrod | Tee365 <jerrod@tee365.org>",
        "to": [to_email],
        "subject": "Before anyone else — Founder's Club is open.",
        "html": html,
    }).encode()
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


if __name__ == "__main__":
    import subprocess

    mode = sys.argv[1] if len(sys.argv) > 1 else "--test"

    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not set")
        sys.exit(1)

    if mode == "--test":
        result = send("m20thesailorman@gmail.com", "Jerrod", "74114765-1df8-4a0d-b2a2-de99c3372089")
        print(f"Test sent: {result}")

    elif mode == "--send":
        result = subprocess.run(
            ["supabase", "db", "query", "--linked",
             "SELECT email, first_name, unsubscribe_token FROM waitlist WHERE unsubscribed_at IS NULL ORDER BY created_at"],
            capture_output=True, text=True, cwd="/home/jerrod/nextjs-boilerplate"
        )
        lines = [l for l in result.stdout.strip().split("\n") if "@" in l]
        sent = 0
        for line in lines:
            parts = [p.strip() for p in line.split("│") if p.strip()]
            if len(parts) >= 3:
                email, first_name, token = parts[0], parts[1], parts[2]
                try:
                    send(email, first_name, token)
                    print(f"  sent → {email}")
                    sent += 1
                except Exception as e:
                    print(f"  FAILED → {email}: {e}")
        print(f"\nDone. {sent} emails sent.")
        # Mark as sent
        subprocess.run(
            ["supabase", "db", "query", "--linked",
             "UPDATE waitlist SET promo_code_sent = true, promo_code_sent_at = now() WHERE unsubscribed_at IS NULL AND promo_code_sent = false"],
            cwd="/home/jerrod/nextjs-boilerplate"
        )
