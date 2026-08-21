"use server"

import { createClient, createServiceClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { FRIENDS_DAY_COUPON_CODE } from "@/lib/bookings/launch-gate"

function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-")
}

export async function redeemHourCreditCode(
  rawCode: string
): Promise<{ ok: boolean; message: string; hours?: number }> {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Please log in to redeem a code." }

  // The Friends Day coupon isn't an hour_credits code - it's applied at
  // checkout, not redeemed here. This is the one "enter a code" box a
  // guest is ever shown, so recognize it before the hour-credit-specific
  // normalization below (which inserts dashes every 4 chars for raffle-
  // style codes) mangles it, and send them straight to a booking page
  // that already has it applied - a real friend tried exactly this and
  // got a confusing "not valid" for a code that actually is valid, just
  // meant for a different box.
  if (rawCode?.trim().toUpperCase() === FRIENDS_DAY_COUPON_CODE) {
    redirect(`/book?code=${FRIENDS_DAY_COUPON_CODE}`)
  }

  const code = normalizeCode(rawCode ?? "")
  if (!code) return { ok: false, message: "Please enter a code." }

  const { data: credit } = await serviceClient
    .from("hour_credits")
    .select("id, user_id, hours, hours_remaining, expires_at, active")
    .eq("code", code)
    .single()

  if (!credit) return { ok: false, message: "That code is not valid." }
  if (credit.user_id === user.id) {
    return { ok: false, message: "You have already redeemed this code." }
  }
  if (credit.user_id !== null) {
    return { ok: false, message: "This code has already been redeemed." }
  }
  if (!credit.active) return { ok: false, message: "This code is no longer active." }
  if (credit.expires_at && new Date(credit.expires_at) < new Date()) {
    return { ok: false, message: "This code has expired." }
  }

  // The .is() guard makes the claim atomic: if two people race, only one wins.
  const { data: claimed } = await serviceClient
    .from("hour_credits")
    .update({ user_id: user.id, redeemed_at: new Date().toISOString() })
    .eq("id", credit.id)
    .is("user_id", null)
    .select("id")

  if (!claimed || claimed.length === 0) {
    return { ok: false, message: "This code has already been redeemed." }
  }

  revalidatePath("/account")
  revalidatePath("/book")

  const hours = Number(credit.hours_remaining)
  return {
    ok: true,
    hours,
    message: `${hours} free hour${hours !== 1 ? "s" : ""} added to your account. They apply automatically when you book.`,
  }
}
