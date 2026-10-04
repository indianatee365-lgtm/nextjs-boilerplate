import { createHmac, timingSafeEqual } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"

/**
 * Campaign email: the branded shell, the little markup language the admin
 * writes in, and the batched send.
 *
 * Deliberately separate from lib/resend/email.ts, which holds transactional
 * templates. Those are fixed copy triggered by an event; this is free text
 * typed by a human and sent to hundreds of people at once, so it needs
 * escaping, an unsubscribe link, a physical address and List-Unsubscribe
 * headers that the transactional mail does not.
 */

const FROM = "Jerrod | Tee365 <jerrod@tee365.org>"
const LOGO = "https://tee365.org/email-logo-v3.png"
const SITE = "https://tee365.org"
const ADDRESS = "Tee365 &middot; 4615 Grape Rd, Mishawaka, IN 46545"

/** Resend accepts at most 100 messages per batch request. */
export const BATCH_SIZE = 100

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Only http(s) links survive. A javascript: or data: URL in an email is either
 * a mistake or an attack, and either way it must not be rendered as a link.
 */
function safeUrl(raw: string): string | null {
  const url = raw.trim()
  if (!/^https?:\/\//i.test(url)) return null
  return escapeHtml(url)
}

/**
 * The markup the compose box accepts. Kept tiny on purpose: everything here is
 * something a campaign actually needs, and nothing here can break the layout.
 *
 *   blank line        new paragraph
 *   ## Heading        section heading
 *   **bold**          bold
 *   [text](url)       link
 *   {{button:Label|url}}   call to action button, on its own line
 *   {{firstName}}     the recipient's first name, "there" when we do not know it
 */
export function renderCampaignBody(body: string, firstName: string | null): string {
  const name = firstName?.trim() || "there"
  const withName = body.replace(/\{\{\s*firstName\s*\}\}/gi, name)

  const blocks = withName
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  const html = blocks.map((block) => {
    const button = block.match(/^\{\{\s*button:([^|]+)\|([^}]+)\}\}$/i)
    if (button) {
      const label = escapeHtml(button[1].trim())
      const url = safeUrl(button[2])
      if (!url) return ""
      return `<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-radius:8px;background:#00A651;">`
        + `<a href="${url}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#05070c;text-decoration:none;">${label}</a>`
        + `</td></tr></table>`
    }

    if (block.startsWith("## ")) {
      return `<h2 style="margin:0 0 14px;font-size:20px;font-weight:700;color:#ffffff;line-height:1.35;">${inline(block.slice(3))}</h2>`
    }

    return `<p style="margin:0 0 20px;font-size:15px;line-height:1.85;color:#9ca3af;">${inline(block)}</p>`
  })

  return html.join("\n")
}

function inline(text: string): string {
  let out = escapeHtml(text)
  // Links before bold, so a URL containing asterisks is not mangled.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    const url = safeUrl(href)
    if (!url) return label
    return `<a href="${url}" style="color:#00A651;text-decoration:underline;">${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>')
  out = out.replace(/\n/g, "<br>")
  return out
}

export function buildCampaignHtml({
  subject,
  body,
  firstName,
  unsubscribeUrl,
}: {
  subject: string
  body: string
  firstName: string | null
  unsubscribeUrl: string
}): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#05070c;font-family:Arial,Helvetica,sans-serif;color:#e5e7eb;">
<div style="background:#05070c;padding:40px 20px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;margin:0 auto;background:linear-gradient(180deg,#05070c,#070b12);border:1px solid rgba(255,255,255,0.14);">
  <tr><td style="padding:24px 20px;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center;">
    <img src="${LOGO}" width="150" height="150" alt="Tee365" style="display:inline-block;">
  </td></tr>
  <tr><td style="padding:36px 40px 20px;">
${renderCampaignBody(body, firstName)}
    <div style="margin-top:36px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0;font-size:15px;font-weight:600;color:#ffffff;font-style:italic;">Jerrod</p>
      <p style="margin:4px 0 0;font-size:11px;color:#00A651;letter-spacing:0.15em;text-transform:uppercase;">Founder, Tee365</p>
    </div>
  </td></tr>
  <tr><td style="background:rgba(0,0,0,0.3);padding:18px 40px;border-top:1px solid rgba(255,255,255,0.04);text-align:center;">
    <p style="margin:0;font-size:11px;color:#374151;line-height:1.7;">
      You are receiving this because you signed up at <a href="${SITE}" style="color:#4b5563;text-decoration:underline;">tee365.org</a>.<br>
      ${ADDRESS}<br><br>
      <a href="${unsubscribeUrl}" style="color:#4b5563;text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>
</table>
</div>
</body></html>`
}

function unsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET
  if (!secret) throw new Error("No UNSUBSCRIBE_SECRET or CRON_SECRET configured")
  return secret
}

/**
 * Signed, stateless unsubscribe. The waitlist has its own stored token and that
 * still works, but account holders have no such row, so the address itself is
 * signed instead of minting and storing a token for all 338 of them.
 */
export function unsubscribeSignature(email: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32)
}

export function verifyUnsubscribeSignature(email: string, signature: string): boolean {
  let expected: string
  try {
    expected = unsubscribeSignature(email)
  } catch {
    return false
  }
  const a = Buffer.from(expected)
  const b = Buffer.from(signature ?? "")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function unsubscribeUrlFor(email: string): string {
  const e = encodeURIComponent(email.trim().toLowerCase())
  return `${SITE}/api/unsubscribe?e=${e}&s=${unsubscribeSignature(email)}`
}

export interface CampaignMessage {
  to: string
  firstName: string | null
}

/**
 * Send one batch through Resend's batch endpoint. Up to BATCH_SIZE messages per
 * call, each personalised and each with its own unsubscribe link, so the whole
 * audience goes out in a handful of requests rather than hundreds of sequential
 * sends racing a function timeout.
 *
 * Throws on a failed request. The caller decides what that means for the
 * campaign, because it has already recorded who it was about to mail.
 */
export async function sendCampaignBatch({
  messages,
  subject,
  body,
}: {
  messages: CampaignMessage[]
  subject: string
  body: string
}): Promise<void> {
  if (messages.length === 0) return
  if (messages.length > BATCH_SIZE) {
    throw new Error(`Batch of ${messages.length} exceeds Resend limit of ${BATCH_SIZE}`)
  }

  const payload = messages.map((m) => {
    const unsubscribeUrl = unsubscribeUrlFor(m.to)
    return {
      from: FROM,
      to: [m.to],
      subject,
      html: buildCampaignHtml({ subject, body, firstName: m.firstName, unsubscribeUrl }),
      headers: {
        // Gmail and Yahoo both weigh these heavily for bulk senders, and
        // without them a campaign this size is far more likely to land in
        // Promotions or Spam than the transactional mail we send today.
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }
  })

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`Resend batch error ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}

/** Single send, used for the test email an admin sends themselves first. */
export async function sendCampaignTest({
  to,
  firstName,
  subject,
  body,
}: {
  to: string
  firstName: string | null
  subject: string
  body: string
}): Promise<void> {
  const supabase = await createServiceClient()
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: `[TEST] ${subject}`,
      html: buildCampaignHtml({ subject, body, firstName, unsubscribeUrl: unsubscribeUrlFor(to) }),
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    await logEvent(supabase, "campaign-test-FAILED", `to=${to} status=${res.status} err=${text.slice(0, 200)}`)
    throw new Error(`Resend error ${res.status}: ${text.slice(0, 200)}`)
  }
  await logEvent(supabase, "campaign-test-sent", `to=${to} subject=${subject.slice(0, 80)}`)
}
