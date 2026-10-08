import Stripe from "stripe"
import { easternDateKey } from "@/lib/time/eastern"
import { logEvent, logFailure, notifyOwner } from "@/lib/observability/notify"
import { sendLeagueChargeFailedSms } from "@/lib/telnyx/sms"
import { LEAGUE_SLUG } from "@/lib/league"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Weekly league charges (rules: "Money"). On each league night's morning,
 * every confirmed team's players are charged to whoever pays for them
 * (league_participants.payer_user_id): $30 each, so a captain paying for both
 * is charged $60 once. Missed weeks are charged too. A cancelled night, or a
 * league that isn't published, charges nobody.
 *
 * Can't double-charge: a league_charges row (unique per week + payer) is
 * written BEFORE Stripe is called, and Stripe gets an idempotency key built
 * from the same pair. A second run the same day finds the row and skips.
 *
 * dryRun returns exactly what would be charged without touching Stripe or the
 * charges table.
 */
export interface ChargePlanRow {
  payerUserId: string
  payerName: string
  players: string[]
  playerIds: string[]
  amount: number
  existing: string | null // status of an existing charge row, if any
}

export async function planLeagueCharges(db: SupabaseClient, dateKey: string): Promise<{
  week: { id: string; week_no: number; play_date: string; cancelled: boolean } | null
  leagueActive: boolean
  rows: ChargePlanRow[]
}> {
  const { data: league } = await db.from("leagues").select("id, active, price_per_session").eq("slug", LEAGUE_SLUG).single()
  const l = league as { id: string; active: boolean; price_per_session: number }
  const { data: week } = await db.from("league_weeks").select("id, week_no, play_date, cancelled")
    .eq("league_id", l.id).eq("play_date", dateKey).maybeSingle()
  if (!week) return { week: null, leagueActive: l.active, rows: [] }

  const { data: parts } = await db.from("league_participants")
    .select("user_id, payer_user_id, team_id, league_teams!inner(status), profiles!league_participants_user_id_fkey(first_name, last_name)")
    .eq("league_id", l.id).eq("league_teams.status", "confirmed")
  type Row = { user_id: string; payer_user_id: string | null; profiles: { first_name: string; last_name: string } | null }
  const byPayer = new Map<string, { names: string[]; ids: string[] }>()
  for (const p of (parts ?? []) as Row[]) {
    const payer = p.payer_user_id ?? p.user_id
    const entry = byPayer.get(payer) ?? { names: [], ids: [] }
    entry.names.push(p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}`.trim() : p.user_id)
    entry.ids.push(p.user_id)
    byPayer.set(payer, entry)
  }

  const payerIds = Array.from(byPayer.keys())
  const [{ data: payers }, { data: existing }] = await Promise.all([
    payerIds.length ? db.from("profiles").select("id, first_name, last_name").in("id", payerIds) : { data: [] },
    db.from("league_charges").select("payer_user_id, status").eq("week_id", week.id),
  ])
  const nameOf = new Map(((payers ?? []) as { id: string; first_name: string; last_name: string }[]).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]))
  const statusOf = new Map(((existing ?? []) as { payer_user_id: string; status: string }[]).map((c) => [c.payer_user_id, c.status]))
  const per = Number(l.price_per_session ?? 0)

  const rows: ChargePlanRow[] = payerIds.map((id) => ({
    payerUserId: id,
    payerName: nameOf.get(id) ?? id,
    players: byPayer.get(id)!.names,
    playerIds: byPayer.get(id)!.ids,
    amount: per * byPayer.get(id)!.ids.length,
    existing: statusOf.get(id) ?? null,
  }))
  return { week, leagueActive: l.active, rows }
}

export async function runLeagueCharges(db: SupabaseClient, now: Date = new Date()): Promise<{
  date: string; charged: number; failed: number; skipped: number; reason?: string
}> {
  const date = easternDateKey(now)
  const plan = await planLeagueCharges(db, date)
  if (!plan.week) return { date, charged: 0, failed: 0, skipped: 0, reason: "not a league night" }
  if (!plan.leagueActive) return { date, charged: 0, failed: 0, skipped: 0, reason: "league not published" }
  if (plan.week.cancelled) return { date, charged: 0, failed: 0, skipped: 0, reason: "league night cancelled" }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { httpClient: Stripe.createFetchHttpClient() })
  const { data: league } = await db.from("leagues").select("id").eq("slug", LEAGUE_SLUG).single()
  let charged = 0, failed = 0, skipped = 0

  for (const row of plan.rows) {
    if (row.existing) { skipped++; continue }
    // Claim the charge first. A concurrent run loses on the unique constraint.
    const { data: claim, error: claimErr } = await db.from("league_charges").insert({
      league_id: (league as { id: string }).id, week_id: plan.week.id, payer_user_id: row.payerUserId,
      player_user_ids: row.playerIds, amount: row.amount, status: "pending",
    }).select("id").single()
    if (claimErr || !claim) { skipped++; continue }

    const fail = async (msg: string) => {
      failed++
      await db.from("league_charges").update({ status: "failed", error: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", claim.id)
      const { data: prof } = await db.from("profiles").select("first_name, phone, sms_consent").eq("id", row.payerUserId).single()
      const p = prof as { first_name: string; phone: string | null; sms_consent: boolean } | null
      if (p?.phone && p.sms_consent) {
        try { await sendLeagueChargeFailedSms({ to: p.phone, firstName: p.first_name, amount: row.amount }) } catch { /* logged below */ }
      }
      await logFailure(db, "league-charge-FAILED", `week=${plan.week!.week_no} payer=${row.payerUserId} amount=${row.amount} err=${msg.slice(0, 200)}`,
        `League charge FAILED: ${row.payerName}, $${row.amount.toFixed(2)} for week ${plan.week!.week_no}. ${msg.slice(0, 120)}`)
    }

    try {
      const { data: prof } = await db.from("profiles").select("stripe_customer_id").eq("id", row.payerUserId).single()
      const customerId = (prof as { stripe_customer_id: string | null } | null)?.stripe_customer_id
      if (!customerId) { await fail("no Stripe customer on file"); continue }
      const customer = await stripe.customers.retrieve(customerId)
      let pm = !("deleted" in customer && customer.deleted)
        ? ((customer as Stripe.Customer).invoice_settings?.default_payment_method as string | null)
        : null
      if (!pm) {
        const cards = await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 1 })
        pm = cards.data[0]?.id ?? null
      }
      if (!pm) { await fail("no card on file"); continue }

      const pi = await stripe.paymentIntents.create({
        amount: Math.round(row.amount * 100),
        currency: "usd",
        customer: customerId,
        payment_method: pm,
        off_session: true,
        confirm: true,
        description: `Tee365 Thursday Night League, week ${plan.week.week_no} (${row.players.join(", ")})`,
        metadata: { type: "league", week_id: plan.week.id, payer_user_id: row.payerUserId },
      }, { idempotencyKey: `league-${plan.week.id}-${row.payerUserId}` })

      if (pi.status === "succeeded") {
        charged++
        await db.from("league_charges").update({ status: "succeeded", stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() }).eq("id", claim.id)
      } else {
        await db.from("league_charges").update({ stripe_payment_intent_id: pi.id }).eq("id", claim.id)
        await fail(`payment status ${pi.status}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await fail(msg)
    }
  }

  await logEvent(db, "league-charges-run", `date=${date} week=${plan.week.week_no} charged=${charged} failed=${failed} skipped=${skipped}`)
  if (charged + failed > 0) {
    await notifyOwner(`League charges, week ${plan.week.week_no}: ${charged} charged${failed ? `, ${failed} FAILED (see texts above)` : ""}.`)
  }
  return { date, charged, failed, skipped }
}
