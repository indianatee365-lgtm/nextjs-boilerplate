#!/usr/bin/env python3
"""
Email B — Pre-launch announcement + EARLYACCESS10
Scheduled cron: run ~Aug 18, 2026 (2 weeks before Sept 1 opening)
Send test: python3 email_b_prelaunch.py --test
Send all:  python3 email_b_prelaunch.py --send  (run by cron)
"""

import sys
import json
import urllib.request
import subprocess
import os

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
UNSUBSCRIBE_BASE = "https://tee365.org/api/unsubscribe?token="
FOUNDERS_CAP = 100


def get_founders_sold() -> int:
    result = subprocess.run(
        ["supabase", "db", "query", "--linked",
         "SELECT COUNT(*) FROM memberships m JOIN membership_plans p ON m.plan_id = p.id WHERE p.slug = 'founder' AND m.status = 'active'"],
        capture_output=True, text=True, cwd="/home/jerrod/nextjs-boilerplate"
    )
    for line in result.stdout.split("\n"):
        line = line.strip().strip("│").strip()
        if line.isdigit():
            return int(line)
    return 0


def build_html(first_name: str, unsubscribe_token: str, founders_sold: int) -> str:
    name = first_name.strip() if first_name else "there"
    unsub_url = UNSUBSCRIBE_BASE + unsubscribe_token
    remaining = FOUNDERS_CAP - founders_sold
    founders_full = remaining <= 0

    if founders_full:
        founders_block = """
      <div class="block-label">Founder's Club</div>
      <div class="block-title">Founder's Club is full.</div>
      <div class="block-body">
        All 100 founding spots have been claimed. If you're one of them — thank you. Your support before we even opened our doors is something we won't forget.<br><br>
        Birdie and Eagle memberships open one week before launch. Stay tuned.
      </div>"""
        founders_cta = ""
    else:
        founders_block = f"""
      <div class="block-label">One more thing</div>
      <div class="block-title">{remaining} Founder's Club spots left.</div>
      <div class="block-body">
        If you've been thinking about it — now's the time. Founder's Club locks in your rate for life: <strong>30% off year one, 20% off forever</strong>. Once the 100 spots are gone, founding pricing closes permanently.
      </div>"""
        founders_cta = """<a href="https://tee365.org/founders" class="cta-ghost" style="margin-top:16px;">View Founder's Club &rarr;</a>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tee365 opens September 1st</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ background-color: #05070c; font-family: Arial, Helvetica, sans-serif; color: #e5e7eb; }}
    .wrap {{ background-color: #05070c; padding: 40px 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #05070c, #070b12); border: 1px solid rgba(255,255,255,0.14); }}
    .header {{ padding: 28px 40px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: center; }}
    .hero {{ padding: 36px 40px 32px; border-bottom: 1px solid rgba(255,255,255,0.06); }}
    .eyebrow {{ font-size: 11px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #00A651; margin-bottom: 10px; }}
    .hero-title {{ font-size: 28px; font-weight: 700; color: #ffffff; line-height: 1.2; margin-bottom: 14px; }}
    .hero-sub {{ font-size: 15px; color: #9ca3af; line-height: 1.8; }}
    .hero-sub strong {{ color: #ffffff; }}
    .block {{ padding: 32px 40px; border-bottom: 1px solid rgba(255,255,255,0.06); }}
    .block-label {{ font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #00A651; margin-bottom: 14px; }}
    .block-title {{ font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }}
    .block-body {{ font-size: 14px; color: #9ca3af; line-height: 1.8; margin-bottom: 20px; }}
    .block-body strong {{ color: #ffffff; }}
    .code-box {{ background: #0a1a0a; border: 2px solid #00A651; border-radius: 10px; padding: 28px 20px; text-align: center; margin-bottom: 8px; }}
    .code-label {{ font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 12px; }}
    .code {{ font-size: 36px; font-weight: 900; color: #00A651; letter-spacing: 6px; font-family: monospace; }}
    .code-sub {{ font-size: 12px; color: #6b7280; margin-top: 10px; }}
    .cta {{ display: block; background: #00A651; color: #ffffff; font-size: 14px; font-weight: 700; text-align: center; padding: 14px 28px; border-radius: 8px; text-decoration: none; }}
    .cta-ghost {{ display: block; background: transparent; color: #00A651; font-size: 14px; font-weight: 700; text-align: center; padding: 13px 28px; border-radius: 8px; text-decoration: none; border: 1px solid #00A651; }}
    .date-badge {{ display: inline-block; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); color: #ffffff; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; padding: 8px 18px; border-radius: 6px; margin-bottom: 20px; }}
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
      <div class="eyebrow">Early access</div>
      <div class="date-badge">September 1, 2026 &nbsp;·&nbsp; Opening Day</div>
      <div class="hero-title">This is what early access is all about, {name}.</div>
      <div class="hero-sub">
        You signed up before we had a sign on the door. Before we had keys to the building. Two weeks from now, Tee365 opens to the public — but <strong>you get there first.</strong><br><br>
        Here's your head start.
      </div>
    </td></tr>

    <!-- EARLYACCESS10 CODE -->
    <tr><td class="block">
      <div class="block-label">Your early access reward</div>
      <div class="block-title">$10 off your first booking.</div>
      <div class="block-body">
        No strings. No membership required. Book any bay, any time — use this code at checkout and $10 comes off your first session automatically.
      </div>
      <div class="code-box">
        <div class="code-label">Your promo code</div>
        <div class="code">EARLYACCESS10</div>
        <div class="code-sub">$10 off your first booking &nbsp;·&nbsp; expires October 31, 2026</div>
      </div>
      <p style="font-size:12px;color:#4b5563;text-align:center;margin:10px 0 22px;">One use per account. Applied at checkout on tee365.org.</p>
      <a href="https://tee365.org/book" class="cta">Book Your First Session &rarr;</a>
    </td></tr>

    <!-- FOUNDERS DYNAMIC BLOCK -->
    <tr><td class="block">
      {founders_block}
      {founders_cta}
    </td></tr>

    <!-- SIGN OFF -->
    <tr><td class="sig">
      <p style="font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:20px;">
        Two weeks. Then the doors open. I'll see you on the other side.
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


def send(to_email: str, first_name: str, unsubscribe_token: str, founders_sold: int):
    html = build_html(first_name, unsubscribe_token, founders_sold)
    payload = json.dumps({
        "from": "Jerrod | Tee365 <jerrod@tee365.org>",
        "to": [to_email],
        "subject": "Two weeks. Then we open. Here's $10 off.",
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
    mode = sys.argv[1] if len(sys.argv) > 1 else "--test"

    if not RESEND_API_KEY:
        print("ERROR: RESEND_API_KEY not set")
        sys.exit(1)

    founders_sold = get_founders_sold()
    print(f"Founders sold: {founders_sold} / {FOUNDERS_CAP}")

    if mode == "--test":
        result = send("m20thesailorman@gmail.com", "Jerrod", "74114765-1df8-4a0d-b2a2-de99c3372089", founders_sold)
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
                    send(email, first_name, token, founders_sold)
                    print(f"  sent → {email}")
                    sent += 1
                except Exception as e:
                    print(f"  FAILED → {email}: {e}")
        print(f"\nDone. {sent} emails sent.")
