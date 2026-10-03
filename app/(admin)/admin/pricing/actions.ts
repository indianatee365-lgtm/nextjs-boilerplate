"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logEvent } from "@/lib/observability/notify"
import { revalidatePath } from "next/cache"

// Prices are money, and five separate call sites read this table live
// (availability, lib/bookings/create, extend, reschedule, account actions), so
// a change here takes effect on the very next quote with no deploy. Every write
// is therefore validated, bounded, and written to admin_logs with the old value
// alongside the new one, so "why did this booking cost that" is always
// answerable after the fact.

const MIN_PRICE = 1
const MAX_PRICE = 500

async function assertAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  const { data: profile } = await serviceClient
    .from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") throw new Error("Forbidden")
  return { serviceClient, userId: user.id }
}

interface RuleRow {
  id: string
  season_type: string
  day_type: string
  time_type: string
  price_per_hour: number
  default_price_per_hour: number
}

function label(r: { season_type: string; day_type: string; time_type: string }) {
  return `${r.season_type}/${r.day_type}/${r.time_type}`
}

/**
 * Applies a set of per-row price edits. Only rows whose value actually changed
 * are written, so saving an untouched form is a genuine no-op rather than eight
 * pointless updates and eight misleading log lines.
 */
export async function updatePricing(edits: Record<string, string>) {
  const { serviceClient, userId } = await assertAdmin()

  const { data, error: readErr } = await serviceClient
    .from("pricing_rules")
    .select("id, season_type, day_type, time_type, price_per_hour, default_price_per_hour")
  if (readErr) throw new Error("Could not read current pricing")
  const rules = (data ?? []) as unknown as RuleRow[]

  const changes: { row: RuleRow; from: number; to: number }[] = []

  for (const rule of rules) {
    const raw = edits[rule.id]
    if (raw === undefined || raw === "") continue

    const next = Number(raw)
    if (!Number.isFinite(next)) {
      throw new Error(`${label(rule)}: "${raw}" is not a number`)
    }
    // Two decimals max. Anything finer is a typo, not a pricing decision.
    if (Math.round(next * 100) !== next * 100) {
      throw new Error(`${label(rule)}: use at most 2 decimal places`)
    }
    if (next < MIN_PRICE || next > MAX_PRICE) {
      throw new Error(`${label(rule)}: $${next} is outside $${MIN_PRICE} to $${MAX_PRICE}`)
    }

    const current = Number(rule.price_per_hour)
    if (next !== current) changes.push({ row: rule, from: current, to: next })
  }

  if (changes.length === 0) return { changed: 0 }

  for (const c of changes) {
    const { error } = await serviceClient
      .from("pricing_rules")
      .update({ price_per_hour: c.to, updated_at: new Date().toISOString() })
      .eq("id", c.row.id)
    if (error) throw new Error(`Failed to save ${label(c.row)}`)
  }

  await logEvent(
    serviceClient,
    "pricing-updated",
    `by=${userId} changes=` +
      changes.map((c) => `${label(c.row)} $${c.from.toFixed(2)}->$${c.to.toFixed(2)}`).join(", "),
  )

  revalidatePath("/admin/pricing")
  revalidatePath("/book")
  return { changed: changes.length }
}

/**
 * Restores every row to default_price_per_hour, the standard table seeded when
 * this feature shipped. Not an undo: it always lands on the same known-good set
 * of eight numbers no matter how many edits came before it.
 */
export async function revertPricingToStandard() {
  const { serviceClient, userId } = await assertAdmin()

  const { data, error: readErr } = await serviceClient
    .from("pricing_rules")
    .select("id, season_type, day_type, time_type, price_per_hour, default_price_per_hour")
  if (readErr) throw new Error("Could not read current pricing")
  const rules = (data ?? []) as unknown as RuleRow[]

  const changed = rules.filter(
    (r) => Number(r.price_per_hour) !== Number(r.default_price_per_hour),
  )

  if (changed.length === 0) return { changed: 0 }

  for (const r of changed) {
    const { error } = await serviceClient
      .from("pricing_rules")
      .update({
        price_per_hour: r.default_price_per_hour,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id)
    if (error) throw new Error(`Failed to revert ${label(r)}`)
  }

  await logEvent(
    serviceClient,
    "pricing-reverted-to-standard",
    `by=${userId} rows=${changed.length} ` +
      changed
        .map(
          (r) =>
            `${label(r)} $${Number(r.price_per_hour).toFixed(2)}->$${Number(
              r.default_price_per_hour,
            ).toFixed(2)}`,
        )
        .join(", "),
  )

  revalidatePath("/admin/pricing")
  revalidatePath("/book")
  return { changed: changed.length }
}
