import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sendParentalConsentRequestEmail } from "@/lib/resend/email"

export const metadata = { title: "Awaiting Parental Consent | Tee365" }

async function resendConsentEmail(formData: FormData) {
  "use server"
  const userId = formData.get("userId") as string
  if (!userId) return
  const serviceClient = await createServiceClient()
  const [{ data: consent }, { data: profile }] = await Promise.all([
    serviceClient.from("parental_consents").select("token, parent_email, token_expires_at")
      .eq("minor_user_id", userId).is("consented_at", null).order("created_at", { ascending: false }).limit(1).single(),
    serviceClient.from("profiles").select("first_name").eq("id", userId).single(),
  ])
  if (!consent || !profile) return
  try {
    await sendParentalConsentRequestEmail({
      to: consent.parent_email,
      minorFirstName: (profile as { first_name: string }).first_name,
      consentUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tee365.org"}/minor-consent/${consent.token}`,
    })
  } catch { /* non-fatal */ }
}

export default async function AwaitingConsentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const serviceClient = await createServiceClient()
  const { data: consent } = await serviceClient
    .from("parental_consents")
    .select("parent_email, consented_at")
    .eq("minor_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (consent?.consented_at) redirect("/account")

  const parentEmail = (consent as { parent_email: string } | null)?.parent_email ?? ""

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-10">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-400 text-2xl">⏳</div>
        <h1 className="text-xl font-semibold text-white">Waiting for parental consent</h1>
        <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
          We sent a consent form to <span className="text-white font-medium">{parentEmail}</span>.
          Your account will be ready to book once they sign it.
        </p>
        <p className="mt-2 text-xs text-neutral-500">The link expires in 7 days.</p>
        <form action={resendConsentEmail} className="mt-8">
          <input type="hidden" name="userId" value={user.id} />
          <button type="submit" className="btn-secondary w-full text-sm">
            Resend consent email
          </button>
        </form>
        <p className="mt-4 text-xs text-neutral-600">
          Wrong email? Contact us at bookings@tee365.org
        </p>
      </div>
    </main>
  )
}
