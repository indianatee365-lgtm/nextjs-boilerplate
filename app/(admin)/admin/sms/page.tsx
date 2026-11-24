import Link from "next/link"
import { ArrowLeft, Phone, UserCircle } from "lucide-react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sendReply } from "./actions"
import { SubmitButton } from "./SubmitButton"
import RealtimeRefresher from "./RealtimeRefresher"
import ThreadScroller from "./ThreadScroller"
import ConversationList, { type ConversationSummary } from "./ConversationList"

export const metadata = { title: "SMS Inbox | Tee365 Admin" }

interface SmsRow {
  id: string
  phone_number: string
  direction: "inbound" | "outbound"
  body: string
  read_at: string | null
  created_at: string
}

const TZ = "America/Indiana/Indianapolis"
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ })

function dayLabel(iso: string): string {
  const key = dayKey(iso)
  const today = dayKey(new Date().toISOString())
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString())
  if (key === today) return "Today"
  if (key === yesterday) return "Yesterday"
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })
}

// Layout (redesigned 2026-11-24): works like a phone's messages app.
// Mobile: the list alone, and tapping a conversation opens it full screen with
// a back button and the reply box pinned to the bottom. Before, the list of
// every contact came first and the open conversation sat underneath it.
// Desktop: list and conversation side by side, each scrolling on its own.
export default async function AdminSmsPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>
}) {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { phone: selectedPhone } = await searchParams

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  // Viewing a conversation counts as reading it. Done as a plain update here
  // (not the markRead server action) because Server Actions call revalidatePath,
  // which Next.js disallows calling during a page's own render.
  if (selectedPhone) {
    await db
      .from("sms_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("phone_number", selectedPhone)
      .is("read_at", null)
  }

  const { data: messages } = await db
    .from("sms_messages")
    .select("id, phone_number, direction, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500)

  const rows = (messages ?? []) as SmsRow[]

  // sms_messages.phone_number and profiles.phone are both stored in the same
  // Telnyx-delivered E.164 format (confirmed against the webhook's own
  // .eq("phone", phone) lookup), so this is a direct match - no normalizing.
  const { data: namedProfiles } = await db
    .from("profiles")
    .select("id, first_name, last_name, phone")
    .not("phone", "is", null)
  const personByPhone = new Map<string, { id: string; name: string }>()
  for (const p of (namedProfiles ?? []) as { id: string; first_name: string; last_name: string; phone: string }[]) {
    personByPhone.set(p.phone, { id: p.id, name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.phone })
  }

  // One conversation per phone number, newest first.
  const byPhone = new Map<string, ConversationSummary>()
  for (const row of rows) {
    let c = byPhone.get(row.phone_number)
    if (!c) {
      c = {
        phone: row.phone_number,
        name: personByPhone.get(row.phone_number)?.name ?? null,
        preview: `${row.direction === "outbound" ? "You: " : ""}${row.body}`,
        at: row.created_at,
        unread: 0,
      }
      byPhone.set(row.phone_number, c)
    }
    if (row.direction === "inbound" && !row.read_at && row.phone_number !== selectedPhone) c.unread++
  }
  const conversations = Array.from(byPhone.values())

  const thread = selectedPhone
    ? rows.filter((r) => r.phone_number === selectedPhone).slice().reverse()
    : []
  const person = selectedPhone ? personByPhone.get(selectedPhone) ?? null : null

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <RealtimeRefresher />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">SMS Inbox</h1>
        <Link
          href="/admin/sms/new"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          New message
        </Link>
      </div>

      <div className="mt-4 md:mt-6 md:grid md:h-[calc(100dvh-11rem)] md:min-h-[480px] md:grid-cols-[320px_1fr] md:gap-4">
        {/* Conversation list. Hidden on mobile while a conversation is open. */}
        <div className={`${selectedPhone ? "hidden md:flex" : "flex"} min-h-0 flex-col rounded-xl border border-white/10`}>
          <ConversationList conversations={conversations} selectedPhone={selectedPhone ?? null} />
        </div>

        {/* Conversation. Full screen on mobile, right pane on desktop. */}
        {selectedPhone ? (
          <section className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a] md:static md:z-auto md:min-h-0 md:rounded-xl md:border md:border-white/10 md:bg-transparent">
            <header className="flex items-center gap-3 border-b border-white/10 px-3 py-3 md:px-4">
              <Link
                href="/admin/sms"
                aria-label="Back to inbox"
                className="-ml-1 rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white md:hidden"
              >
                <ArrowLeft size={20} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{person?.name ?? selectedPhone}</p>
                {person && <p className="text-xs text-neutral-500">{selectedPhone}</p>}
              </div>
              <a
                href={`tel:${selectedPhone}`}
                aria-label="Call"
                className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"
              >
                <Phone size={18} />
              </a>
              {person && (
                <Link
                  href={`/admin/users/${person.id}`}
                  aria-label="Customer profile"
                  className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"
                >
                  <UserCircle size={18} />
                </Link>
              )}
            </header>

            <ThreadScroller
              phone={selectedPhone}
              lastMessageId={thread.length ? thread[thread.length - 1].id : null}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-4 md:px-4"
            >
              {thread.length === 0 && (
                <p className="py-10 text-center text-sm text-neutral-500">No messages with this number yet.</p>
              )}
              {thread.map((m, i) => {
                const newDay = i === 0 || dayKey(m.created_at) !== dayKey(thread[i - 1].created_at)
                return (
                  <div key={m.id}>
                    {newDay && (
                      <p className="py-2 text-center text-[11px] font-medium text-neutral-500">{dayLabel(m.created_at)}</p>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm md:max-w-[70%] ${m.direction === "outbound" ? "ml-auto bg-[#00A651]/25 text-white" : "bg-white/[0.07] text-neutral-100"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="mt-1 text-right text-[10px] text-neutral-500">
                        {new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </ThreadScroller>

            <form
              action={sendReply}
              className="flex items-end gap-2 border-t border-white/10 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-4"
            >
              <input type="hidden" name="phone" value={selectedPhone} />
              <textarea
                name="body"
                required
                rows={2}
                placeholder="Text message"
                className="input flex-1 resize-none text-base md:text-sm"
              />
              <SubmitButton className="btn-primary px-4">Send</SubmitButton>
            </form>
          </section>
        ) : (
          <div className="hidden items-center justify-center rounded-xl border border-white/10 md:flex">
            <p className="text-sm text-neutral-500">Pick a conversation to read and reply.</p>
          </div>
        )}
      </div>
    </main>
  )
}
