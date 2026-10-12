import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { addDaysToDateKey, easternDateKey } from "@/lib/time/eastern"
import { durationOf, hostLabel, money, sendPaymentLink, whenLabel, type EventRow } from "@/lib/events"
import { logEvent, notifyOwner } from "@/lib/observability/notify"

// Daily, morning (vercel.json). For every upcoming event not paid in full:
//   * 2 days before the payment due date: a reminder with the link to the customer (once per stage)
//   * the day after the due date passes: a text to Jerrod (once per stage). Bays stay held; he decides.
//   * the day before the event, still not paid in full: a text to Jerrod (once)
// "Stage" is deposit vs balance; recomputeEvent clears both flags when it changes.
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret")
    ?? request.nextUrl.searchParams.get("secret")
    ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = await createServiceClient()
  const today = easternDateKey(new Date())
  const { data } = await db.from("events").select("*").in("status", ["awaiting_payment", "deposit_paid"]).gt("starts_at", new Date().toISOString())
  const done: string[] = []
  for (const e of (data ?? []) as (EventRow & { customer_reminded_at: string | null; owner_alerted_at: string | null })[]) {
    const due = e.status === "awaiting_payment" ? (e.deposit_amount ? e.pay_by : e.pay_by) : e.balance_due
    const what = e.status === "awaiting_payment" ? (e.deposit_amount ? "deposit" : "payment") : "balance"
    if (due) {
      if (!e.customer_reminded_at && today >= addDaysToDateKey(due, -2) && today <= due) {
        await sendPaymentLink(db, e, "reminder")
        await db.from("events").update({ customer_reminded_at: new Date().toISOString() }).eq("id", e.id)
        done.push(`reminded ${e.id}`)
      }
      if (!e.owner_alerted_at && today > due) {
        await notifyOwner(`Event "${e.title}" (${e.contact_name}): the ${what} was due ${due} and hasn't been paid. ${money(e.amount_paid)} of ${money(e.price_total)} paid. The bays are still held. Cancel or follow up on /admin/events.`)
        await db.from("events").update({ owner_alerted_at: new Date().toISOString() }).eq("id", e.id)
        done.push(`overdue ${e.id}`)
      }
    }
    if (easternDateKey(new Date(e.starts_at)) === addDaysToDateKey(today, 1)) {
      const { count } = await db.from("admin_logs").select("id", { count: "exact", head: true }).eq("event", "event-unpaid-eve").eq("detail", `event=${e.id}`)
      if (!count) {
        await logEvent(db, "event-unpaid-eve", `event=${e.id}`)
        await notifyOwner(`Heads up: "${e.title}" is tomorrow (${whenLabel(e.starts_at, e.ends_at)}) and is NOT paid in full: ${money(e.amount_paid)} of ${money(e.price_total)}. The door code still goes out as normal.`)
        done.push(`eve ${e.id}`)
      }
    }
  }
  // Host reminder: the day before any event (paid or not) that booked a host.
  const { data: hosted } = await db.from("events").select("*").neq("status", "cancelled").is("host_reminded_at", null).gt("starts_at", new Date().toISOString())
  for (const e of (hosted ?? []) as EventRow[]) {
    if (!e.host_hours?.length || easternDateKey(new Date(e.starts_at)) !== addDaysToDateKey(today, 1)) continue
    await notifyOwner(`Host tomorrow: "${e.title}" (${e.contact_name}) needs a host ${hostLabel(e.starts_at, durationOf(e), e.host_hours)}.`)
    await db.from("events").update({ host_reminded_at: new Date().toISOString() }).eq("id", e.id)
    done.push(`host ${e.id}`)
  }
  return NextResponse.json({ ok: true, done })
}
