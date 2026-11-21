import type { Metadata } from "next"
import Link from "next/link"
import { HourPackStore } from "./HourPackStore"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { HOUR_PACK_VALID_MONTHS } from "@/lib/hour-packs/packs"

const TITLE = "Golf Simulator Hour Packs | Tee365 Indoor Golf Mishawaka"
const DESCRIPTION = "Prepay for simulator time at Tee365 and save. 5 and 10 hour packs, for you or as a gift, good any day and any time."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "https://tee365.org/hour-packs" },
  openGraph: {
    type: "website", title: TITLE, description: DESCRIPTION, url: "https://tee365.org/hour-packs",
    images: [{ url: "https://tee365.org/hero.jpg" }], siteName: "Tee365", locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["https://tee365.org/hero.jpg"] },
}

export default async function HourPacksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let signedInName: string | null = null
  if (user) {
    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle()
    const p = profile as { first_name: string | null; last_name: string | null } | null
    signedInName = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || null
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="text-center mb-10">
        <p className="text-sm font-semibold tracking-widest uppercase text-brand mb-2">Hour Packs</p>
        <h1 className="text-3xl font-bold text-white mb-3">Prepay and play for less</h1>
        <p className="text-neutral-400 text-base max-w-md mx-auto">
          Buy simulator hours up front, for yourself or as a gift. Use them any day, any time, for {HOUR_PACK_VALID_MONTHS} months.
          They come off your booking automatically.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 mb-8">
        <HourPackStore signedInName={signedInName} signedInEmail={user?.email ?? null} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 text-sm text-neutral-400 space-y-2">
        <h2 className="text-base font-semibold text-white">How it works</h2>
        <p>Hours are used by the hour on any bay booking, up to 4 players per bay.</p>
        <p>Gifts arrive by email with a code. The recipient signs in at tee365.org, opens Account, and enters the code under Free hours.</p>
        <p>Rather give a dollar amount? <Link href="/gift-cards" className="text-brand hover:underline">Buy a gift card</Link>.</p>
      </div>
    </main>
  )
}
