import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyUnsubscribeSignature } from "@/lib/resend/campaign"
import { logEvent } from "@/lib/observability/notify"

/**
 * Two link shapes, because there are two kinds of recipient.
 *
 *   ?token=<uuid>   the original waitlist link, stored per row. Still live in
 *                   every welcome email ever sent, so it must keep working.
 *   ?e=<email>&s=<sig>  campaign mail. Account holders have no waitlist row, so
 *                   rather than minting and storing a token for all of them the
 *                   address itself is signed. The signature is what stops
 *                   anyone unsubscribing someone else by editing the URL.
 *
 * Either way the address lands in email_opt_outs, which every segment is
 * filtered against, and the waitlist row is marked too when there is one.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  const email = req.nextUrl.searchParams.get("e")
  const signature = req.nextUrl.searchParams.get("s")

  const supabase = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  if (token) {
    const { data, error } = await db
      .from("waitlist")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("unsubscribe_token", token)
      .is("unsubscribed_at", null)
      .select("email")

    if (error) {
      console.error("[unsubscribe] waitlist error:", error)
    }

    // Mirror into email_opt_outs so a campaign to any other segment cannot
    // reach them either. Before this, unsubscribing only stopped waitlist mail.
    const row = (data ?? [])[0] as { email: string } | undefined
    if (row?.email) {
      await db.from("email_opt_outs")
        .upsert({ email: row.email.toLowerCase(), source: "waitlist-token" }, { onConflict: "email" })
      await logEvent(supabase, "email-opt-out", `email=${row.email.toLowerCase()} via=waitlist-token`)
    }

    return NextResponse.redirect(new URL("/unsubscribed", req.url))
  }

  if (email && signature && verifyUnsubscribeSignature(email, signature)) {
    const normalized = email.trim().toLowerCase()
    await db.from("email_opt_outs")
      .upsert({ email: normalized, source: "campaign-link" }, { onConflict: "email" })
    await db.from("waitlist")
      .update({ unsubscribed_at: new Date().toISOString() })
      .ilike("email", normalized)
      .is("unsubscribed_at", null)
    await logEvent(supabase, "email-opt-out", `email=${normalized} via=campaign-link`)

    return NextResponse.redirect(new URL("/unsubscribed", req.url))
  }

  return NextResponse.redirect(new URL("/", req.url))
}

/**
 * One-click unsubscribe. Gmail and Yahoo require bulk senders to honour a POST
 * to the List-Unsubscribe URL, and they check, so this is not optional for a
 * campaign of this size.
 */
export async function POST(req: NextRequest) {
  return GET(req)
}
