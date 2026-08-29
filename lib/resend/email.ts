import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

function fmt(amount: number): string {
  return `$${amount.toFixed(2)}`
}

// Every email template funnels through here, so every send - success or
// failure - gets one admin_logs row without relying on each call site to
// remember to log it. `kind` identifies which template sent it.
async function sendResendEmail({
  to,
  from,
  subject,
  html,
  kind,
}: {
  to: string
  from: string
  subject: string
  html: string
  kind: string
}) {
  const supabase = await createServiceClient()
  let res: Response
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
  } catch (err) {
    await logEvent(supabase, "email-send-FAILED", `kind=${kind} to=${to} err=${String(err).slice(0, 200)}`)
    throw err
  }

  if (!res.ok) {
    const body = await res.text()
    await logEvent(supabase, "email-send-FAILED", `kind=${kind} to=${to} status=${res.status} err=${body.slice(0, 200)}`)
    throw new Error(`Resend error ${res.status}: ${body}`)
  }

  await logEvent(supabase, "email-sent", `kind=${kind} to=${to} subject=${subject.slice(0, 100)}`)
}

export async function sendGiftCardEmail({
  recipientEmail,
  recipientName,
  senderName,
  code,
  amount,
}: {
  recipientEmail: string
  recipientName: string
  senderName: string
  code: string
  amount: number
}) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <tr>
            <td style="background:#111;padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
              <p style="margin:6px 0 0;color:#a3a3a3;font-size:13px;">Indoor Golf Simulator &mdash; South Bend, IN</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;text-align:center;">
              <p style="margin:0 0 4px;font-size:13px;color:#777;text-transform:uppercase;letter-spacing:1px;">You&rsquo;ve received a gift!</p>
              <h1 style="margin:0 0 6px;font-size:36px;font-weight:800;color:#111;">${fmt(amount)}</h1>
              <p style="margin:0 0 28px;color:#555;font-size:15px;">Gift Card from <strong>${senderName}</strong></p>

              <div style="background:#f9f9f9;border-radius:8px;padding:24px;margin-bottom:28px;">
                <p style="margin:0 0 8px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">Your gift card code</p>
                <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:6px;color:#111;font-family:monospace;">${code}</p>
              </div>

              <p style="margin:0 0 6px;color:#555;font-size:14px;line-height:1.6;">
                Hi ${recipientName}! Use this code at checkout on tee365.org when booking your simulator session.
                The full ${fmt(amount)} will be applied to your booking automatically.
              </p>
              <p style="margin:12px 0 0;color:#999;font-size:12px;">
                Gift cards never expire &middot; Check your balance at
                <a href="https://tee365.org/gift-cards" style="color:#4ade80;text-decoration:none;">tee365.org/gift-cards</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.8;">
                Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>
                Tee365 &middot; South Bend, IN
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  await sendResendEmail({
    to: recipientEmail,
    from: "Tee365 <bookings@tee365.org>",
    subject: `🎁 You've received a ${fmt(amount)} Tee365 gift card!`,
    html,
    kind: "gift-card",
  })
}

function lineItem(label: string, value: string, isDiscount = false): string {
  return `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #eee;color:${isDiscount ? "#16a34a" : "#555"};font-size:14px;">${label}</td>
      <td style="padding:10px 0;border-top:1px solid #eee;text-align:right;color:${isDiscount ? "#16a34a" : "#111"};font-size:14px;">${value}</td>
    </tr>`
}

function buildEmailHtml({
  firstName,
  bayName,
  startsAt,
  endsAt,
  subtotal,
  membershipDiscount,
  couponDiscount,
  tax,
  giftCardApplied,
  total,
  hourCreditDiscount = 0,
  headline = "Booking Confirmed!",
  intro = `Hi ${firstName}, you&rsquo;re all set. Here are your booking details.`,
}: {
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
  subtotal: number
  membershipDiscount: number
  couponDiscount: number
  tax: number
  giftCardApplied: number
  total: number
  hourCreditDiscount?: number
  headline?: string
  intro?: string
}): string {
  const dateStr = startsAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Indiana/Indianapolis",
  })
  const startTime = startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const endTime = endsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  const lines = [
    lineItem("Subtotal", fmt(subtotal)),
    hourCreditDiscount > 0 ? lineItem("Free hours applied", `−${fmt(hourCreditDiscount)}`, true) : "",
    membershipDiscount > 0 ? lineItem("Member discount", `−${fmt(membershipDiscount)}`, true) : "",
    couponDiscount > 0 ? lineItem("Coupon discount", `−${fmt(couponDiscount)}`, true) : "",
    tax > 0 ? lineItem("Indiana sales tax (7%)", fmt(tax)) : "",
    giftCardApplied > 0 ? lineItem("Gift card", `−${fmt(giftCardApplied)}`, true) : "",
  ].join("")

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
          <tr>
            <td style="background:#111;padding:28px 32px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
              <p style="margin:6px 0 0;color:#a3a3a3;font-size:13px;">Indoor Golf Simulator &mdash; South Bend, IN</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 6px;color:#111;font-size:20px;">${headline}</h2>
              <p style="margin:0 0 24px;color:#555;font-size:14px;">${intro}</p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:4px 0 10px;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Bay</td>
                        <td style="padding:4px 0 10px;text-align:right;color:#111;font-size:14px;font-weight:600;">${bayName}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0 10px;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Date</td>
                        <td style="padding:4px 0 10px;text-align:right;color:#111;font-size:14px;font-weight:600;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;color:#777;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Time</td>
                        <td style="padding:4px 0;text-align:right;color:#111;font-size:14px;font-weight:600;">${startTime} &ndash; ${endTime}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <h3 style="margin:0 0 0;color:#111;font-size:15px;font-weight:700;">Receipt</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${lines}
                <tr>
                  <td style="padding:12px 0;border-top:2px solid #111;font-size:16px;font-weight:700;color:#111;">Total charged</td>
                  <td style="padding:12px 0;border-top:2px solid #111;text-align:right;font-size:16px;font-weight:700;color:#111;">${fmt(total)}</td>
                </tr>
              </table>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin-top:24px;">
                <p style="margin:0;color:#166534;font-size:14px;line-height:1.5;">
                  &#128274; Your 6-digit access code will be sent to your phone via SMS approximately 15 minutes before your session. You&rsquo;ll need it to enter the facility.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.8;">
                Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>
                Tee365 &middot; South Bend, IN
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendBookingConfirmationEmail({
  to,
  firstName,
  bayName,
  startsAt,
  endsAt,
  subtotal,
  membershipDiscount,
  couponDiscount,
  tax,
  giftCardApplied,
  total,
  hourCreditDiscount = 0,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
  subtotal: number
  membershipDiscount: number
  couponDiscount: number
  tax: number
  giftCardApplied: number
  total: number
  hourCreditDiscount?: number
}) {
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Your Tee365 booking is confirmed",
    html: buildEmailHtml({
      firstName,
      bayName,
      startsAt,
      endsAt,
      subtotal,
      membershipDiscount,
      couponDiscount,
      tax,
      giftCardApplied,
      total,
      hourCreditDiscount,
    }),
    kind: "booking-confirmation",
  })
}

// Fallback channel for the access code when the customer hasn't consented
// to SMS - grantBayAccess() itself never depended on sms_consent (it doesn't
// use phone at all), only the notification did. Every confirmed booking
// gets a working door code regardless of texting preference; this is just
// the other way to deliver it, mirroring sendAccessCodeReminder's SMS
// wording so both channels say the same thing.
export async function sendAccessCodeEmail({
  to,
  firstName,
  bayName,
  accessCode,
  startsAt,
}: {
  to: string
  firstName: string
  bayName: string
  accessCode: string
  startsAt: Date
}) {
  const timeStr = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Your access code</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 24px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your session in <strong style="color:#fff;">${bayName}</strong> starts <strong style="color:#fff;">${timeStr}</strong>. Use this code at the door to get in:</p>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 24px;">
<span style="display:inline-block;padding:16px 32px;border-radius:8px;background:#0f1f0f;border:1px solid #1a3a1a;font-size:32px;font-weight:700;letter-spacing:6px;color:#4ade80;">${accessCode}</span>
</td></tr></table>
<p style="margin:0;color:#a3a3a3;font-size:15px;line-height:1.6;">You can also find this code any time on your <a href="https://tee365.org/account/bookings" style="color:#4ade80;text-decoration:none;">account bookings page</a>.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Your Tee365 access code",
    html,
    kind: "access-code-email",
  })
}

export async function sendParentalConsentRequestEmail({
  to,
  minorFirstName,
  consentUrl,
}: {
  to: string
  minorFirstName: string
  consentUrl: string
}) {
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: `Parental consent needed for ${minorFirstName}'s Tee365 account`,
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">
<div style="max-width:520px;margin:0 auto;background:#141414;border-radius:12px;padding:36px;border:1px solid #262626">
  <h1 style="margin:0 0 8px;font-size:22px;color:#fff">Parental Consent Required</h1>
  <p style="margin:0 0 20px;color:#a3a3a3;font-size:14px">Tee365 Indoor Golf</p>
  <p style="color:#d4d4d4;line-height:1.6">${minorFirstName} has created an account at Tee365 Indoor Golf and listed you as their parent or guardian.</p>
  <p style="color:#d4d4d4;line-height:1.6">Because ${minorFirstName} is under 18, we require a parent or guardian to review and sign our consent form before they can make bookings.</p>
  <p style="color:#d4d4d4;line-height:1.6">This takes about 60 seconds.</p>
  <div style="text-align:center;margin:32px 0">
    <a href="${consentUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Review &amp; Sign Consent Form</a>
  </div>
  <p style="color:#737373;font-size:12px;line-height:1.6">This link expires in 7 days. If you did not expect this email, you can safely ignore it — no account will be activated without your signature.</p>
  <hr style="border:none;border-top:1px solid #262626;margin:24px 0">
  <p style="color:#737373;font-size:12px">Questions? Reply to this email or contact us at bookings@tee365.org</p>
</div></body></html>`,
    kind: "parental-consent-request",
  })
}

export async function sendMinorAccountApprovedEmail({
  to,
  firstName,
}: {
  to: string
  firstName: string
}) {
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "You're all set — your Tee365 account is ready",
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 20px;margin:0">
<div style="max-width:520px;margin:0 auto;background:#141414;border-radius:12px;padding:36px;border:1px solid #262626">
  <h1 style="margin:0 0 20px;font-size:22px;color:#fff">You're good to go, ${firstName}!</h1>
  <p style="color:#d4d4d4;line-height:1.6">Your parent or guardian has completed the consent form. Your Tee365 account is now fully active and you can book a bay.</p>
  <div style="text-align:center;margin:32px 0">
    <a href="https://tee365.org/book" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Book a Bay</a>
  </div>
  <hr style="border:none;border-top:1px solid #262626;margin:24px 0">
  <p style="color:#737373;font-size:12px">Tee365 Indoor Golf &nbsp;·&nbsp; bookings@tee365.org</p>
</div></body></html>`,
    kind: "minor-account-approved",
  })
}

export async function sendFounderConfirmationEmail({
  to,
  firstName,
  founderNumber,
}: {
  to: string
  firstName: string
  founderNumber: number
}) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
        <p style="margin:6px 0 0;color:#737373;font-size:13px;">Indoor Golf Simulator &mdash; Mishawaka, IN</p>
      </td></tr>
      <tr><td style="padding:40px 32px;text-align:center;">
        <p style="margin:0 0 8px;font-size:12px;color:#4ade80;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Founder's Club</p>
        <h1 style="margin:0 0 6px;font-size:36px;font-weight:800;color:#fff;">You're in.</h1>
        <p style="margin:0 0 32px;color:#a3a3a3;font-size:15px;">Welcome to the Founder's Club, ${firstName}.</p>
        <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:24px;margin-bottom:32px;">
          <p style="margin:0 0 4px;font-size:11px;color:#737373;text-transform:uppercase;letter-spacing:2px;">Your member number</p>
          <p style="margin:0;font-size:52px;font-weight:900;color:#4ade80;">#${founderNumber}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#52525b;">of 100 ever</p>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;text-align:left;">
          <tr><td colspan="2" style="padding-bottom:12px;font-size:14px;font-weight:700;color:#fff;border-bottom:1px solid #27272a;">What you've locked in</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;color:#a3a3a3;font-size:13px;">Discount, year one</td><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;text-align:right;color:#4ade80;font-size:13px;font-weight:600;">30% off every session</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;color:#a3a3a3;font-size:13px;">Discount, forever after</td><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;text-align:right;color:#4ade80;font-size:13px;font-weight:600;">20% off, locked for life</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;color:#a3a3a3;font-size:13px;">Advance booking window</td><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;text-align:right;color:#fff;font-size:13px;font-weight:600;">21 days</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;color:#a3a3a3;font-size:13px;">Active reservations</td><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;text-align:right;color:#fff;font-size:13px;font-weight:600;">Up to 3 at a time</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;color:#a3a3a3;font-size:13px;">Founders &amp; Friends Day</td><td style="padding:10px 0;border-bottom:1px solid #1c1c1e;text-align:right;color:#fff;font-size:13px;font-weight:600;">2 complimentary hours</td></tr>
          <tr><td style="padding:10px 0;color:#a3a3a3;font-size:13px;">Founders Wall</td><td style="padding:10px 0;text-align:right;color:#fff;font-size:13px;font-weight:600;">Your name, permanent</td></tr>
        </table>
        <div style="background:#0f1f0f;border:1px solid #1a3a1a;border-radius:8px;padding:20px;margin-bottom:32px;text-align:left;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#4ade80;">What happens next</p>
          <p style="margin:0;color:#86efac;font-size:13px;line-height:1.7;">Tee365 opens September 2026. You'll receive an email before the booking calendar goes live — Founders get 48 hours before anyone else.<br><br><strong>Founders &amp; Friends Day</strong> is a private pre-opening event for you, your family, and friends. Two complimentary hours included. Details coming closer to opening.<br><br>Your name will be on the permanent Founders Wall inside the facility from day one.</p>
        </div>
        <div style="border-top:1px solid #27272a;padding-top:24px;text-align:left;">
          <p style="margin:0 0 10px;font-size:12px;color:#4ade80;text-transform:uppercase;letter-spacing:1px;">From Jerrod</p>
          <p style="margin:0 0 10px;color:#a3a3a3;font-size:14px;line-height:1.7;">When I started building Tee365 I had no idea if anyone would believe in it before the doors opened. You did. That means more than I can put in an email.</p>
          <p style="margin:0 0 12px;color:#a3a3a3;font-size:14px;">See you at Founders Day.</p>
          <p style="margin:0;font-size:13px;color:#fff;font-weight:600;">Jerrod</p>
          <p style="margin:2px 0 0;font-size:11px;color:#4ade80;text-transform:uppercase;letter-spacing:1px;">Founder, Tee365</p>
        </div>
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
        <p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  await sendResendEmail({
    to,
    from: "Jerrod | Tee365 <jerrod@tee365.org>",
    subject: `Welcome to Founder's Club — you're #${founderNumber} of 100`,
    html,
    kind: "founder-confirmation",
  })
}

export async function sendEagleConfirmationEmail({
  to,
  firstName,
}: {
  to: string
  firstName: string
}) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
      <tr><td style="background:#111;padding:28px 32px;text-align:center;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
        <p style="margin:6px 0 0;color:#a3a3a3;font-size:13px;">Indoor Golf Simulator &mdash; Mishawaka, IN</p>
      </td></tr>
      <tr><td style="padding:36px 32px;">
        <h2 style="margin:0 0 6px;color:#111;font-size:24px;font-weight:800;">Welcome to Eagle, ${firstName}.</h2>
        <p style="margin:0 0 28px;color:#555;font-size:14px;">Your membership is active. Here's what you've got.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;margin-bottom:24px;"><tr><td style="padding:20px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#777;font-size:13px;">Bay discount</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#16a34a;font-size:13px;font-weight:700;">20% off every session</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#777;font-size:13px;">Advance booking</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#111;font-size:13px;font-weight:600;">14 days out</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#777;font-size:13px;">Active reservations</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#111;font-size:13px;font-weight:600;">Up to 3 at a time</td></tr>
            <tr><td style="padding:8px 0;color:#777;font-size:13px;">Signup bonus</td><td style="padding:8px 0;text-align:right;color:#16a34a;font-size:13px;font-weight:700;">2 free hours (90-day credit)</td></tr>
          </table>
        </td></tr></table>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:18px;margin-bottom:24px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#166534;">Your 2 free hours</p>
          <p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">Your signup bonus is credited to your account and valid for 90 days. The discount applies automatically when you book — no code needed.</p>
        </div>
        <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.7;">Tee365 opens September 2026. Your 14-day advance booking window and 20% discount apply from your first session.</p>
        <div style="text-align:center;"><a href="https://tee365.org/account" style="display:inline-block;background:#111;color:#4ade80;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View your account</a></div>
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #eee;text-align:center;">
        <p style="margin:0;color:#999;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Welcome to Eagle — your 2 free hours are waiting",
    html,
    kind: "eagle-confirmation",
  })
}


export async function sendCancellationConfirmation({
  to, firstName, planName, endDate, isFounder, founderNumber,
}: {
  to: string
  firstName: string
  planName: string
  endDate: string
  isFounder: boolean
  founderNumber: number | null
}) {
  const founderNote = isFounder && founderNumber
    ? `<div style="background:#0f1f0f;border:1px solid #1a3a1a;border-radius:8px;padding:16px;margin:24px 0;">
         <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#4ade80;">Your Founder status is permanent</p>
         <p style="margin:0;color:#86efac;font-size:13px;line-height:1.6;">Member <strong>#${founderNumber}</strong> is yours, always. Reactivate any time at your original Founder's terms — same discount, same booking window, same number on the Founders Wall.</p>
       </div>`
    : ""
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Cancellation confirmed</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your <strong style="color:#fff;">${planName}</strong> membership has been set to cancel. You will keep full access through <strong style="color:#fff;">${endDate}</strong>, after which no further charges will occur.</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Changed your mind? Sign in to your account before ${endDate} and reactivate in one click.</p>
${founderNote}
<p style="margin:16px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Thank you for being part of Tee365.</p>
<p style="margin:16px 0 0;font-size:13px;color:#fff;">Jerrod</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Jerrod | Tee365 <jerrod@tee365.org>",
    subject: `Your ${planName} membership — cancellation confirmed`,
    html,
    kind: "cancellation-confirmation",
  })
}

export async function sendReactivationConfirmation({
  to, firstName, planName, isFounder, founderNumber,
}: {
  to: string
  firstName: string
  planName: string
  isFounder: boolean
  founderNumber: number | null
}) {
  const founderNote = isFounder && founderNumber
    ? `<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Welcome back, Founder #${founderNumber}.</p>`
    : ""
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">You're back in.</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
${founderNote}
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your <strong style="color:#fff;">${planName}</strong> membership has been reactivated. Billing continues as scheduled. All your member benefits remain in place.</p>
<p style="margin:16px 0 0;font-size:13px;color:#fff;">Jerrod</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Jerrod | Tee365 <jerrod@tee365.org>",
    subject: `Your ${planName} membership has been reactivated`,
    html,
    kind: "reactivation-confirmation",
  })
}

export async function sendPaymentRetryEmail({
  to, firstName, planName, amount,
}: {
  to: string
  firstName: string
  planName: string
  amount: string
}) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Your checkout didn't finish</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Looks like your <strong style="color:#fff;">${planName}</strong> signup ($${amount}) didn't go through — checkout expired before it finished. No charge was made, and nothing is pending on your account.</p>
<p style="margin:0 0 24px;color:#a3a3a3;font-size:15px;line-height:1.6;">If you'd like to pick up where you left off, just click below.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/join" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">Finish signing up</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Questions or ran into an issue? Just reply to this email.</p>
<p style="margin:16px 0 0;font-size:13px;color:#fff;">Jerrod</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Jerrod | Tee365 <jerrod@tee365.org>",
    subject: `${firstName}, finish setting up your ${planName} membership?`,
    html,
    kind: "payment-retry",
  })
}

export async function sendSubscriptionPastDueEmail({
  to, firstName, planDisplayName,
}: {
  to: string
  firstName: string
  planDisplayName: string
}) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Your membership renewal didn't go through</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your card was declined on your <strong style="color:#fff;">${planDisplayName}</strong> membership renewal. Stripe will automatically retry the charge over the next several days, but to make sure it succeeds - and to avoid any pause in your benefits - please update your payment method.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/account#payment-method" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">Update payment method</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Questions or ran into an issue? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Action needed: your Tee365 membership renewal failed",
    html,
    kind: "subscription-past-due",
  })
}

export async function sendBookingPaymentFailedEmail({
  to, firstName, bayName, startsAt,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
}) {
  const timeStr = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Your booking payment didn't go through</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your payment for <strong style="color:#fff;">${bayName}</strong> on <strong style="color:#fff;">${timeStr}</strong> didn't go through, so that time slot has been released back to the calendar. No charge was made.</p>
<p style="margin:0 0 24px;color:#a3a3a3;font-size:15px;line-height:1.6;">If you'd still like to play, you're welcome to rebook, just know the slot isn't being held for you.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/book" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">Rebook a bay</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Questions or ran into an issue? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Your Tee365 booking payment didn't go through",
    html,
    kind: "booking-payment-failed",
  })
}

export async function sendBookingCancellationEmail({
  to, firstName, bayName, startsAt, endsAt, refundAmount, creditHoursRestored,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
  refundAmount: number
  creditHoursRestored: number
}) {
  const startStr = startsAt.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const endStr = endsAt.toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis",
  })

  const refundLine = refundAmount > 0
    ? `<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">A refund of <strong style="color:#fff;">$${refundAmount.toFixed(2)}</strong> has been issued back to your card.</p>`
    : ""
  const creditLine = creditHoursRestored > 0
    ? `<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;"><strong style="color:#fff;">${creditHoursRestored} hour${creditHoursRestored === 1 ? "" : "s"}</strong> of credit has been restored to your account and is ready to use on a new booking.</p>`
    : ""

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Your booking has been cancelled</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your session in <strong style="color:#fff;">${bayName}</strong> on <strong style="color:#fff;">${startStr} to ${endStr}</strong> has been cancelled.</p>
${refundLine}${creditLine}
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/book" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">Book another time</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Questions or think this is a mistake? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a></p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Your Tee365 booking has been cancelled",
    html,
    kind: "booking-cancellation",
  })
}

// Reuses buildEmailHtml (the same receipt layout sendBookingConfirmationEmail
// uses) rather than a bare "here's your new time" note, since a customer
// self-serve reschedule can genuinely change the price (a charge or refund
// for the difference) - they should see the same itemized breakdown they'd
// see on a fresh booking, not just a time/bay update. The admin drag-reschedule
// path never reprices, but passes the booking's original (unchanged) totals
// through here too, so both paths render the same receipt-style email.
export async function sendBookingRescheduledEmail({
  to,
  firstName,
  bayName,
  startsAt,
  endsAt,
  subtotal,
  membershipDiscount,
  couponDiscount,
  tax,
  giftCardApplied,
  total,
  hourCreditDiscount = 0,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
  subtotal: number
  membershipDiscount: number
  couponDiscount: number
  tax: number
  giftCardApplied: number
  total: number
  hourCreditDiscount?: number
}) {
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Your Tee365 booking has been rescheduled",
    html: buildEmailHtml({
      firstName,
      bayName,
      startsAt,
      endsAt,
      subtotal,
      membershipDiscount,
      couponDiscount,
      tax,
      giftCardApplied,
      total,
      hourCreditDiscount,
      headline: "Booking Rescheduled",
      intro: `Hi ${firstName}, your booking has been moved. Here are your updated details.`,
    }),
    kind: "booking-rescheduled",
  })
}

export async function sendAccountWelcomeEmail({
  to, firstName,
}: {
  to: string
  firstName: string
}) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Welcome to Tee365, ${firstName}!</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your account is set up and ready to go. Book a bay whenever you'd like, browse memberships for a discount on every session, or just look around.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/book" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">Book a bay</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Questions? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545</p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "Welcome to Tee365 — your account is ready",
    html,
    kind: "account-welcome",
  })
}

export async function sendMembershipWelcomeEmail({
  to, firstName, planName,
}: {
  to: string
  firstName: string
  planName: string
}) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">Welcome to Tee365, ${firstName}!</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Your <strong style="color:#fff;">${planName}</strong> membership is active. Your member discount and booking perks apply automatically starting now.</p>
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/book" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">Book a bay</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Manage your membership anytime from your account page. Questions? Just reply to this email.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545</p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: `Welcome to Tee365 — your ${planName} membership is active`,
    html,
    kind: "membership-welcome",
  })
}

export async function sendSmsOptOutConfirmationEmail({
  to, firstName,
}: {
  to: string
  firstName: string
}) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">You're unsubscribed from texts</h1>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">We got your STOP text. You won't receive any more texts from Tee365, including booking confirmations, reminders, and access codes. This email confirms it, and won't happen again unless you text START.</p>
<div style="background:#1a1400;border:1px solid #3a2f00;border-radius:8px;padding:16px;margin:24px 0;">
<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#facc15;">If you have an upcoming booking</p>
<p style="margin:0;color:#fde68a;font-size:13px;line-height:1.6;">Your access code will no longer be texted to you before your session. Find it anytime on your account page instead.</p>
</div>
<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="https://tee365.org/account" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">View your account</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">This doesn't affect email, and you can text START to tee365's number any time to resubscribe.</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545</p>
</td></tr></table></td></tr></table></body></html>`
  await sendResendEmail({
    to,
    from: "Tee365 <bookings@tee365.org>",
    subject: "You're unsubscribed from Tee365 texts",
    html,
    kind: "sms-opt-out-confirmation",
  })
}


// Reusable branded template for one-off messages to founders (or anyone) -
// pass paragraphs as plain strings and this handles the HTML wrapper,
// matching the look of every other Tee365 email. Signed "jerrod" (lowercase,
// matching the informal from-name Jerrod wants for personal notes - not
// "Jerrod | Tee365") rather than each caller re-writing the boilerplate.
export async function sendFounderMessage({
  to,
  firstName,
  subject,
  heading,
  paragraphs,
  ctaText,
  ctaUrl,
}: {
  to: string
  firstName: string
  subject: string
  heading: string
  paragraphs: string[]
  ctaText?: string
  ctaUrl?: string
}) {
  const bodyParagraphs = [
    `Hi ${firstName},`,
    ...paragraphs,
  ]
    .map((p) => `<p style="margin:0 0 16px;color:#a3a3a3;font-size:15px;line-height:1.6;">${p}</p>`)
    .join("\n")

  const cta = ctaText && ctaUrl
    ? `<table cellpadding="0" cellspacing="0"><tr><td style="border-radius:6px;background:#4ade80;">
<a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#111;text-decoration:none;">${ctaText}</a>
</td></tr></table>`
    : ""

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#111;border-radius:8px;overflow:hidden;">
<tr><td style="background:#111;padding:28px 32px;text-align:center;border-bottom:1px solid #222;">
<p style="margin:0;font-size:22px;font-weight:700;color:#4ade80;letter-spacing:1px;">TEE365</p>
</td></tr>
<tr><td style="padding:36px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;color:#fff;">${heading}</h1>
${bodyParagraphs}
${cta}
<p style="margin:24px 0 0;color:#a3a3a3;font-size:15px;line-height:1.6;">Questions or ran into an issue? Just reply to this email.</p>
<p style="margin:16px 0 0;font-size:13px;color:#fff;">jerrod</p>
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #222;text-align:center;">
<p style="margin:0;color:#525252;font-size:12px;line-height:1.8;">Questions? <a href="mailto:info@tee365.org" style="color:#4ade80;text-decoration:none;">info@tee365.org</a><br>Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545</p>
</td></tr></table></td></tr></table></body></html>`

  await sendResendEmail({
    to,
    from: "jerrod <jerrod@tee365.org>",
    subject,
    html,
    kind: "founder-message",
  })
}
