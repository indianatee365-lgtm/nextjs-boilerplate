function fmt(amount: number): string {
  return `$${amount.toFixed(2)}`
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tee365 <bookings@tee365.org>",
      to: [recipientEmail],
      subject: `🎁 You've received a ${fmt(amount)} Tee365 gift card!`,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
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
    membershipDiscount > 0 ? lineItem("Member discount", `−${fmt(membershipDiscount)}`, true) : "",
    couponDiscount > 0 ? lineItem("Coupon discount", `−${fmt(couponDiscount)}`, true) : "",
    lineItem("Indiana sales tax (7%)", fmt(tax)),
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
              <h2 style="margin:0 0 6px;color:#111;font-size:20px;">Booking Confirmed!</h2>
              <p style="margin:0 0 24px;color:#555;font-size:14px;">Hi ${firstName}, you&rsquo;re all set. Here are your booking details.</p>

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
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tee365 <bookings@tee365.org>",
      to: [to],
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
      }),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
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
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tee365 <bookings@tee365.org>",
      to: [to],
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
    }),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}

export async function sendMinorAccountApprovedEmail({
  to,
  firstName,
}: {
  to: string
  firstName: string
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Tee365 <bookings@tee365.org>",
      to: [to],
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
    }),
  })
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`)
}
