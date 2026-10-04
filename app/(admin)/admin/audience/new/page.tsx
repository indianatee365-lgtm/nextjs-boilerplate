import Link from "next/link"
import { randomUUID } from "crypto"
import { requireAdmin } from "@/lib/admin/guard"
import {
  getSegmentRecipients,
  isAudienceSegment,
  SEGMENT_ORDER,
  SEGMENT_LABELS,
  SEGMENT_DESCRIPTIONS,
  type AudienceSegment,
} from "@/lib/admin/audience"
import { buildCampaignHtml } from "@/lib/resend/campaign"
import { sendCampaign, sendTest } from "../actions"
import { SubmitButton } from "../../sms/SubmitButton"

export const metadata = { title: "New Campaign | Tee365 Admin" }
// A send to the whole audience is four Resend batch calls plus the audience
// query. Comfortably inside this, but the default 60s would be tight if Resend
// is slow.
export const maxDuration = 300

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; segment?: string; subject?: string; body?: string; tested?: string; edit?: string }>
}) {
  await requireAdmin()

  const { name = "", segment: rawSegment, subject = "", body = "", tested, edit } = await searchParams
  const segment: AudienceSegment | null = isAudienceSegment(rawSegment) ? rawSegment : null

  // `edit` sends a filled-in draft back to the form instead of the preview,
  // so the Edit button does not just bounce straight back to the preview.
  const ready = Boolean(name.trim() && segment && subject.trim() && body.trim()) && edit !== "1"
  const recipients = ready && segment ? await getSegmentRecipients(segment) : []
  const nonce = ready ? randomUUID() : ""

  const previewHtml = ready
    ? buildCampaignHtml({
        subject,
        body,
        firstName: recipients[0]?.firstName ?? null,
        unsubscribeUrl: "https://tee365.org/api/unsubscribe",
      })
    : ""

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">New Campaign</h1>
        <Link href="/admin/audience" className="text-sm text-neutral-400 hover:text-white transition-colors">
          Back to audience
        </Link>
      </div>

      {!ready && (
        <form method="GET" action="/admin/audience/new" className="mt-8 space-y-5">
          <div>
            <label className="text-sm text-neutral-400">Campaign name</label>
            <input
              name="name"
              required
              defaultValue={name}
              maxLength={80}
              placeholder="October thank you"
              className="input mt-1 w-full"
            />
            <p className="mt-1 text-xs text-neutral-600">For your reference only. Customers never see this.</p>
          </div>

          <div>
            <label className="text-sm text-neutral-400">Send to</label>
            <div className="mt-2 space-y-2">
              {SEGMENT_ORDER.map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm text-neutral-200">
                  <input
                    type="radio"
                    name="segment"
                    value={s}
                    defaultChecked={s === rawSegment || (!rawSegment && s === "all")}
                    required
                    className="mt-1"
                  />
                  <span>
                    {SEGMENT_LABELS[s]}
                    <span className="block text-xs text-neutral-500">{SEGMENT_DESCRIPTIONS[s]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-neutral-400">Subject</label>
            <input
              name="subject"
              required
              defaultValue={subject}
              maxLength={150}
              placeholder="We're open, and we owe you a thank you"
              className="input mt-1 w-full"
            />
          </div>

          <div>
            <label className="text-sm text-neutral-400">Message</label>
            <textarea
              name="body"
              required
              rows={14}
              defaultValue={body}
              placeholder={"Hi {{firstName}},\n\nWrite in normal paragraphs. Leave a blank line between them.\n\n## A heading looks like this\n\nUse **bold** for emphasis and [a link](https://tee365.org/book) where you need one.\n\n{{button:Book a bay|https://tee365.org/book}}"}
              className="input mt-1 w-full resize-y font-mono text-sm"
            />
            <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-neutral-500 leading-relaxed">
              <strong className="text-neutral-400">Formatting:</strong> blank line starts a new paragraph.
              {" "}<code className="text-neutral-300">{"{{firstName}}"}</code> fills in their first name, or
              {" "}&quot;there&quot; when we do not have it.
              {" "}<code className="text-neutral-300">## Heading</code> for a heading.
              {" "}<code className="text-neutral-300">**bold**</code> for bold.
              {" "}<code className="text-neutral-300">[text](https://...)</code> for a link.
              {" "}<code className="text-neutral-300">{"{{button:Book now|https://tee365.org/book}}"}</code> on its own
              line for a button. The logo, your signature, the address and the unsubscribe link are added for you.
            </div>
          </div>

          <button type="submit" className="btn-primary">Preview</button>
        </form>
      )}

      {ready && segment && (
        <div className="mt-8 space-y-5">
          {tested === "1" && (
            <div className="rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm text-brand">
              Test sent to your own address. Check it before sending for real.
            </div>
          )}

          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-sm text-neutral-400">Sending to</p>
            <p className="text-lg font-semibold text-white">
              {SEGMENT_LABELS[segment]} &middot; {recipients.length} {recipients.length === 1 ? "person" : "people"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Unsubscribed and banned addresses are already excluded.
            </p>
            {recipients.length > 0 && (
              <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-sm text-neutral-400">
                {recipients.slice(0, 15).map((r) => (
                  <li key={r.email}>{r.firstName ?? "Unknown"} &middot; {r.displayEmail}</li>
                ))}
                {recipients.length > 15 && <li>...and {recipients.length - 15} more</li>}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-sm text-neutral-400">Subject</p>
            <p className="mt-1 text-white">{subject}</p>
            <p className="mt-4 text-sm text-neutral-400">Preview</p>
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              className="mt-2 h-[460px] w-full rounded-lg border border-white/10 bg-[#05070c]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/admin/audience/new?${new URLSearchParams({ name, segment, subject, body }).toString()}&edit=1`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
            >
              Edit
            </Link>

            <form action={sendTest}>
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="segment" value={segment} />
              <input type="hidden" name="subject" value={subject} />
              <input type="hidden" name="body" value={body} />
              <SubmitButton
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
                pendingText="Sending test..."
              >
                Send test to me
              </SubmitButton>
            </form>

            {recipients.length > 0 && (
              <form action={sendCampaign}>
                <input type="hidden" name="name" value={name} />
                <input type="hidden" name="segment" value={segment} />
                <input type="hidden" name="subject" value={subject} />
                <input type="hidden" name="body" value={body} />
                <input type="hidden" name="nonce" value={nonce} />
                <SubmitButton className="btn-primary" pendingText="Sending...">
                  Send to {recipients.length} {recipients.length === 1 ? "person" : "people"} now
                </SubmitButton>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
