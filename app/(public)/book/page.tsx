import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import BookingFlow from "./BookingFlow"

export const metadata = {
  title: "Book a Bay | Tee365",
}

export default async function BookPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single()

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, started_at, membership_plans(slug, discount_percent, first_year_discount, advance_booking_days)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  const membershipSlug = (membership?.membership_plans as { slug: string } | null)?.slug ?? null
  const advanceDays = (membership?.membership_plans as { advance_booking_days: number } | null)?.advance_booking_days ?? 7

  const { data: bays } = await supabase
    .from("bays")
    .select("id, number, name")
    .eq("active", true)
    .order("number")

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Book a Bay</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Select a date, bay, and time. Payment required to confirm.
      </p>
      <BookingFlow
        bays={bays ?? []}
        advanceDays={advanceDays}
        membershipSlug={membershipSlug}
        userName={profile ? `${profile.first_name} ${profile.last_name}` : ""}
      />
    </main>
  )
}
