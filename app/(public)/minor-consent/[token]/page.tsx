import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sendMinorAccountApprovedEmail } from "@/lib/resend/email"
import { headers } from "next/headers"

export const metadata = { title: "Parental Consent | Tee365" }

const WAIVER = `By submitting this form, I confirm the following:

I am the parent or legal guardian of the minor named above. I have read and agree to the Tee365 Liability Waiver, Facility Rules, and Guest & Age Policy on their behalf. I understand that my minor child will be held to the same standards and policies as adult customers, including responsibility for equipment damage and compliance with facility rules. I authorize Tee365 to process bookings made by my minor child under their account. I understand that guests under 16 must be accompanied by a responsible adult at all times, and that guests aged 16-17 may use the facility independently under this consent.`

async function submitConsent(formData: FormData) {
  "use server"
  const token = formData.get("token") as string
  const parentName = formData.get("parentName") as string
  const agreed = formData.get("agreed")

  if (!agreed || !parentName?.trim()) return

  const serviceClient = await createServiceClient()
  const { data: consent } = await serviceClient
    .from("parental_consents")
    .select("id, minor_user_id, token_expires_at, consented_at")
    .eq("token", token)
    .single()

  if (!consent || consent.consented_at || new Date(consent.token_expires_at) < new Date()) return

  const hdrs = await headers()
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

  await serviceClient.from("parental_consents").update({
    parent_name: parentName.trim(),
    consented_at: new Date().toISOString(),
    waiver_snapshot: WAIVER,
    ip_address: ip,
  }).eq("token", token)

  await serviceClient.from("profiles").update({
    parental_consent_verified: true,
  }).eq("id", consent.minor_user_id)

  const [{ data: profile }, { data: authUser }] = await Promise.all([
    serviceClient.from("profiles").select("first_name").eq("id", consent.minor_user_id).single(),
    serviceClient.auth.admin.getUserById(consent.minor_user_id),
  ])

  const firstName = (profile as { first_name: string } | null)?.first_name ?? ""
  const email = authUser.user?.email
  if (email) {
    try { await sendMinorAccountApprovedEmail({ to: email, firstName }) } catch { /* non-fatal */ }
  }

  redirect("/minor-consent/complete")
}

export default async function MinorConsentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const serviceClient = await createServiceClient()

  const { data: consent } = await serviceClient
    .from("parental_consents")
    .select("minor_user_id, token_expires_at, consented_at")
    .eq("token", token)
    .single()

  if (!consent) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-10">
          <p className="text-white font-semibold">Link not found</p>
          <p className="mt-2 text-sm text-neutral-400">This consent link is invalid. Contact bookings@tee365.org for help.</p>
        </div>
      </main>
    )
  }

  if (consent.consented_at) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-xl border border-brand/20 bg-brand/5 px-6 py-10">
          <p className="text-white font-semibold">Already signed</p>
          <p className="mt-2 text-sm text-neutral-400">This consent form has already been completed. The account is active.</p>
        </div>
      </main>
    )
  }

  if (new Date(consent.token_expires_at) < new Date()) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-6 py-10">
          <p className="text-white font-semibold">Link expired</p>
          <p className="mt-2 text-sm text-neutral-400">This link has expired. Ask your child to log in and resend the consent email.</p>
        </div>
      </main>
    )
  }

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", consent.minor_user_id)
    .single()

  const minorName = profile
    ? `${(profile as { first_name: string; last_name: string }).first_name} ${(profile as { first_name: string; last_name: string }).last_name}`
    : "your child"

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-8">
        <h1 className="text-xl font-semibold text-white">Parental Consent — Tee365 Indoor Golf</h1>
        <p className="mt-2 text-sm text-neutral-400">
          <span className="text-white font-medium">{minorName}</span> has created a Tee365 account and listed you as their parent or guardian.
        </p>

        <div className="mt-6 rounded-lg bg-black/30 p-4 text-xs text-neutral-400 leading-relaxed whitespace-pre-line">
          {WAIVER}
        </div>

        <form action={submitConsent} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label" htmlFor="parentName">Your full name</label>
            <input id="parentName" name="parentName" type="text" required className="input" placeholder="Jane Smith" />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" name="agreed" required className="mt-0.5 shrink-0 accent-green-500" />
            <span className="text-sm text-neutral-300">
              I have read the above and consent on behalf of {minorName}.
            </span>
          </label>
          <button type="submit" className="btn-primary w-full">
            Submit consent
          </button>
        </form>
      </div>
    </main>
  )
}
