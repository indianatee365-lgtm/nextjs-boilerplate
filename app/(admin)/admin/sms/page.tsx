import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sendReply } from "./actions"
import { SubmitButton } from "./SubmitButton"

export const metadata = { title: "SMS Inbox | Tee365 Admin" }

interface SmsRow {
  id: string
  phone_number: string
  direction: "inbound" | "outbound"
  body: string
  read_at: string | null
  created_at: string
}

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

  // Group into one conversation per phone number, newest first.
  const conversations = new Map<string, { latest: SmsRow; unread: number }>()
  for (const row of rows) {
    const existing = conversations.get(row.phone_number)
    if (!existing) {
      conversations.set(row.phone_number, { latest: row, unread: 0 })
    }
    if (row.direction === "inbound" && !row.read_at) {
      conversations.get(row.phone_number)!.unread++
    }
  }

  const thread = selectedPhone
    ? rows.filter((r) => r.phone_number === selectedPhone).slice().reverse()
    : []

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">SMS Inbox</h1>
        <Link
          href="/admin/sms/new"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
        >
          New message
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-400">
        Texts sent to the Tee365 number. Replies go out from that same number.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
          {conversations.size === 0 && (
            <p className="p-4 text-sm text-neutral-500">No messages yet.</p>
          )}
          {Array.from(conversations.entries()).map(([phone, { latest, unread }]) => (
            <a
              key={phone}
              href={`/admin/sms?phone=${encodeURIComponent(phone)}`}
              className={`block px-4 py-3 hover:bg-white/5 transition-colors ${selectedPhone === phone ? "bg-white/10" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{phone}</span>
                {unread > 0 && (
                  <span className="rounded-full bg-[#00A651] px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                {latest.direction === "outbound" ? "You: " : ""}{latest.body}
              </p>
            </a>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 p-4">
          {!selectedPhone ? (
            <p className="text-sm text-neutral-500">Select a conversation to view and reply.</p>
          ) : (
            <>
              <div className="max-h-[50vh] space-y-3 overflow-y-auto">
                {thread.map((m) => (
                  <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.direction === "outbound" ? "ml-auto bg-[#00A651]/20 text-white" : "bg-white/5 text-neutral-200"}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-[10px] text-neutral-500">
                      {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Indiana/Indianapolis" })}
                    </p>
                  </div>
                ))}
              </div>

              <form action={sendReply} className="mt-4 flex gap-2">
                <input type="hidden" name="phone" value={selectedPhone} />
                <textarea
                  name="body"
                  required
                  rows={2}
                  placeholder="Type a reply..."
                  className="input flex-1 resize-none"
                />
                <SubmitButton className="btn-primary self-end">Send</SubmitButton>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
