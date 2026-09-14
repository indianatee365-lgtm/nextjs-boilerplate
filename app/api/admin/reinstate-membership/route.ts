import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { reinstateMembership } from "@/lib/membership/reinstate"

async function getAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await serviceClient.from("profiles").select("role, first_name").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") return null
  return { user, serviceClient }
}

/**
 * Put a lapsed member back where they were, at their original price with the
 * founder joining fee waived. Admin-only on purpose: it forgives $199 that a
 * fresh signup would pay, and founder enrollment is closed so there is no
 * self-serve path that could do this correctly.
 *
 * Pass overrideCooldown to reinstate someone who already came back inside the
 * last year - the once-a-year rule is Jerrod's, so Jerrod can waive it.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId, overrideCooldown } = await request.json()
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  const result = await reinstateMembership(admin.serviceClient, {
    userId,
    overrideCooldown: overrideCooldown === true,
    actorLabel: `admin:${admin.user.id}`,
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 409 })
}
