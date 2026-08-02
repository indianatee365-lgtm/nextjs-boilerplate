import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { randomUUID } from "crypto"
import { sendIndividualMessage, sendGroupMessage } from "../actions"
import { SubmitButton } from "../SubmitButton"
import { GROUP_LABELS, getGroupRecipients, isSmsGroup, type SmsGroup } from "@/lib/admin/sms-groups"

export const metadata = { title: "New Message | Tee365 Admin" }
export const maxDuration = 60

export default async function NewSmsMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; group?: string; body?: string }>
}) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { mode: rawMode, group: rawGroup, body } = await searchParams
  const mode = rawMode === "group" ? "group" : "individual"
  const group: SmsGroup | null = isSmsGroup(rawGroup) ? rawGroup : null

  const showPreview = mode === "group" && group && body?.trim()
  const recipients = showPreview ? await getGroupRecipients(group) : []
  const nonce = showPreview ? randomUUID() : ""

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">New Message</h1>
        <Link href="/admin/sms" className="text-sm text-neutral-400 hover:text-white transition-colors">
          Back to inbox
        </Link>
      </div>

      <div className="mt-6 flex gap-1 rounded-lg border border-white/10 p-1 w-fit">
        <Link
          href="/admin/sms/new?mode=individual"
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${mode === "individual" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"}`}
        >
          Individual
        </Link>
        <Link
          href="/admin/sms/new?mode=group"
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${mode === "group" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"}`}
        >
          Group
        </Link>
      </div>

      {mode === "individual" && (
        <form action={sendIndividualMessage} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-neutral-400">Phone number</label>
            <input
              type="tel"
              name="phone"
              required
              placeholder="574-555-0100"
              className="input mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-sm text-neutral-400">Message</label>
            <textarea
              name="body"
              required
              rows={5}
              maxLength={1000}
              placeholder="Type a message..."
              className="input mt-1 w-full resize-none"
            />
          </div>
          <SubmitButton className="btn-primary">Send</SubmitButton>
        </form>
      )}

      {mode === "group" && !showPreview && (
        <form method="GET" action="/admin/sms/new" className="mt-8 space-y-4">
          <input type="hidden" name="mode" value="group" />
          <div>
            <label className="text-sm text-neutral-400">Send to</label>
            <div className="mt-2 space-y-2">
              {(Object.keys(GROUP_LABELS) as SmsGroup[]).map((g) => (
                <label key={g} className="flex items-center gap-2 text-sm text-neutral-200">
                  <input type="radio" name="group" value={g} defaultChecked={g === "founders"} required />
                  {GROUP_LABELS[g]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-neutral-400">Message</label>
            <textarea
              name="body"
              required
              rows={5}
              maxLength={1000}
              defaultValue={body}
              placeholder="Type a message..."
              className="input mt-1 w-full resize-none"
            />
          </div>
          <button type="submit" className="btn-primary">Preview recipients</button>
        </form>
      )}

      {showPreview && group && (
        <div className="mt-8 space-y-4">
          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-sm text-neutral-400">Sending to</p>
            <p className="text-lg font-semibold text-white">{GROUP_LABELS[group]} &middot; {recipients.length} {recipients.length === 1 ? "person" : "people"}</p>
            {recipients.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                No eligible recipients (must have a phone number and SMS consent on file).
              </p>
            ) : (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-neutral-400">
                {recipients.slice(0, 20).map((r) => (
                  <li key={r.phone}>{r.firstName ?? "Unknown"} &middot; {r.phone}</li>
                ))}
                {recipients.length > 20 && <li>...and {recipients.length - 20} more</li>}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/10 p-4">
            <p className="text-sm text-neutral-400">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-white">{body}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/admin/sms/new?mode=group`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
            >
              Edit
            </Link>
            {recipients.length > 0 && (
              <form action={sendGroupMessage}>
                <input type="hidden" name="group" value={group} />
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
