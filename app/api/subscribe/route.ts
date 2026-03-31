import { NextRequest, NextResponse } from "next/server"

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    }).toString(),
  })

  if (!res.ok) {
    throw new Error(`Zoho token refresh failed: ${res.status}`)
  }

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`No access_token in Zoho response: ${JSON.stringify(data)}`)
  }

  return data.access_token
}

async function sendWelcomeEmail(accessToken: string, toEmail: string, firstName: string) {
  const accountId = process.env.ZOHO_MAIL_ACCOUNT_ID!
  const fromAddress = "info@tee365.org"
  const displayName = firstName ? firstName : "there"

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to Tee365</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #05070c; font-family: Arial, Helvetica, sans-serif; color: #e5e7eb; -webkit-font-smoothing: antialiased; }
    .email-wrapper { background-color: #05070c; padding: 40px 20px; }
    .email-container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #05070c, #070b12); border: 1px solid rgba(255,255,255,0.14); }
    .header { padding: 28px 40px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .brand-name { font-size: 15px; font-weight: 600; color: #ffffff; letter-spacing: 0.06em; vertical-align: middle; margin-left: 10px; text-transform: uppercase; }
    .hero-strip { padding: 32px 40px 28px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .hero-eyebrow { font-size: 11px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #00A651; margin-bottom: 10px; }
    .hero-title { font-size: 26px; font-weight: 300; color: #ffffff; line-height: 1.3; letter-spacing: -0.01em; }
    .hero-title strong { font-weight: 600; }
    .body-content { padding: 36px 40px 32px; }
    .coming-badge { display: inline-block; background-color: rgba(0,166,81,0.1); border: 1px solid rgba(0,166,81,0.25); color: #00A651; font-size: 10px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; padding: 4px 14px; margin-bottom: 24px; }
    .greeting { font-size: 15px; color: #9ca3af; margin-bottom: 28px; line-height: 1.7; }
    .greeting strong { color: #e5e7eb; font-weight: 500; }
    .divider { height: 1px; background: linear-gradient(90deg, rgba(0,166,81,0.4) 0%, rgba(255,255,255,0.03) 100%); margin: 0 0 28px; }
    .body-text { font-size: 15px; line-height: 1.85; color: #9ca3af; margin-bottom: 20px; }
    .body-text strong { color: #ffffff; font-weight: 600; }
    .pull-quote { border-left: 2px solid #00A651; padding: 6px 0 6px 20px; margin: 28px 0; font-size: 17px; font-weight: 500; color: #ffffff; line-height: 1.5; }
    .tagline { display: block; background-color: rgba(0,166,81,0.1); border: 1px solid rgba(0,166,81,0.25); color: #00A651; font-size: 14px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 20px; margin: 8px 0 24px; text-align: center; }
    .signature { margin-top: 36px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); }
    .signature-name { font-size: 15px; font-weight: 600; color: #ffffff; font-style: italic; }
    .signature-title { font-size: 11px; color: #00A651; letter-spacing: 0.15em; text-transform: uppercase; margin-top: 4px; }
    .social-section { background-color: rgba(0,0,0,0.25); padding: 24px 40px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; }
    .social-label { font-size: 10px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: #4b5563; margin-bottom: 14px; }
    .social-link { display: inline-block; margin: 0 6px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.14); line-height: 32px; text-align: center; text-decoration: none; color: #9ca3af; font-size: 11px; font-weight: 600; }
    .footer { background-color: rgba(0,0,0,0.3); padding: 18px 40px; border-top: 1px solid rgba(255,255,255,0.04); text-align: center; }
    .footer-text { font-size: 11px; color: #374151; line-height: 1.7; }
    .footer-text a { color: #4b5563; text-decoration: underline; }
    @media only screen and (max-width: 480px) {
      .header, .hero-strip, .body-content, .social-section, .footer { padding-left: 24px; padding-right: 24px; }
      .hero-title { font-size: 22px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <table class="email-container" width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td class="header" style="text-align:center;">
          <img src="https://tee365.org/logo.png" width="120" height="120" alt="Tee365" style="display:inline-block;">
        </td>
      </tr>
      <tr>
        <td class="hero-strip">
          <div class="hero-eyebrow">A note from Jerrod</div>
          <div class="hero-title"><strong>Welcome to Tee365.</strong></div>
        </td>
      </tr>
      <tr>
        <td class="body-content">
          <div class="coming-badge">⬤ &nbsp;Coming Fall 2026</div>
          <p class="greeting">Hey <strong>${displayName}</strong>,<br>Thanks for signing up. It means more than you know.</p>
          <div class="divider"></div>
          <p class="body-text">Not long ago, the closest place to work on your swing during a Michiana winter was 40 miles away. I know because I was the guy making that drive.</p>
          <p class="body-text">I'm from here. The Navy took me everywhere else. I chose to come back. I raised my family here. I believe in this town.</p>
          <p class="body-text">So we're building the place I always wanted. No bar. No crowd. No bill that makes you wince. Just you, a bay, and 70 degrees year round.</p>
          <div class="pull-quote">Your game shouldn't be held hostage by the weather. It isn't at Tee365.</div>
          <p class="body-text">Indiana winters are long. Rain happens. The sun sets earlier than you'd like, and summers here can be brutally hot. Real golf is at the mercy of all of it. Tee365 isn't. Whether it's a January blizzard or a July scorcher, neither factors into your tee time here, because:</p>
          <div class="tagline">It's Always 70° At Tee365</div>
          <p class="body-text">We're not open yet but we're close, and you'll be first to know. Your game has been waiting long enough.</p>
          <div class="signature">
            <p class="signature-name">Jerrod</p>
            <p class="signature-title">Founder, Tee365</p>
          </div>
        </td>
      </tr>
      <tr>
        <td class="social-section">
          <div class="social-label">Follow along</div>
          <a href="https://www.instagram.com/tee365.mishawaka" class="social-link">IG</a>
          <a href="https://www.facebook.com/profile.php?id=61578292102933" class="social-link">FB</a>
          <a href="https://www.tiktok.com/@tee36568" class="social-link">TK</a>
          <a href="https://tee365.org" class="social-link">↗</a>
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p class="footer-text">
            You're receiving this because you signed up at <a href="https://tee365.org">tee365.org</a>.<br>
            Tee365 · Mishawaka, Indiana<br><br>
            <a href="https://tee365.org">Visit our site</a>
          </p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`

  const body = {
    fromAddress,
    toAddress: toEmail,
    subject: "Welcome to Tee365",
    content: html,
    mailFormat: "html",
  }

  const res = await fetch(`https://mail.zoho.com/api/accounts/${accountId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoho Mail send failed: ${res.status} ${text}`)
  }
}

export async function POST(req: NextRequest) {
  const { email, firstName } = await req.json()

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }

  const listKey = process.env.ZOHO_LIST_KEY
  if (!listKey || !process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken()
  } catch (err) {
    console.error("[subscribe] Token error:", err)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }

  const contactInfo: Record<string, string> = { "Contact Email": email }
  if (firstName && typeof firstName === "string") {
    contactInfo["First Name"] = firstName
  }

  const params = new URLSearchParams({
    listkey: listKey,
    resfmt: "JSON",
    contactinfo: JSON.stringify(contactInfo),
  })

  const res = await fetch("https://campaigns.zoho.com/api/v1.1/json/listsubscribe", {
    method: "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  const responseText = await res.text()

  if (!res.ok) {
    return NextResponse.json({ error: "Subscription failed" }, { status: 502 })
  }

  let responseData: { code?: string | number; status?: string; message?: string }
  try {
    responseData = JSON.parse(responseText)
  } catch {
    return NextResponse.json({ error: "Unexpected response from Zoho" }, { status: 502 })
  }

  if (String(responseData.code) !== "0") {
    console.error("[subscribe] Zoho logical error:", responseData)
    return NextResponse.json({ error: responseData.message ?? "Subscription failed" }, { status: 422 })
  }

  // Send welcome email — non-blocking, don't fail the signup if this errors
  if (process.env.ZOHO_MAIL_ACCOUNT_ID) {
    sendWelcomeEmail(accessToken, email, firstName ?? "").catch((err) =>
      console.error("[subscribe] Welcome email error:", err)
    )
  }

  return NextResponse.json({ success: true })
}
