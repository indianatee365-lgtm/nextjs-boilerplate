import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { createGiveawayCodes, toggleGiveawayCode } from "./actions"
import GrantMembershipForm from "./GrantMembershipForm"

export const metadata = { title: "Membership Giveaways | Tee365 Admin" }

export default async function AdminMembershipGiveawaysPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const [{ data: plans }, { data: codes }] = await Promise.all([
    serviceClient.from("membership_plans").select("id, slug, display_name, name, price_monthly").eq("active", true).order("price_monthly"),
    serviceClient
      .from("membership_giveaway_codes")
      .select("id, code, free_period, note, expires_at, active, redeemed_at, created_at, membership_plans(display_name, name), profiles!membership_giveaway_codes_redeemed_by_fkey(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(200),
  ])

  const activePlans = plans ?? []
  const allCodes = codes ?? []
  const unredeemedCount = allCodes.filter((c) => c.active && !c.redeemed_at).length
  const redeemedCount = allCodes.filter((c) => c.redeemed_at).length

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Membership Giveaways</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Print or hand out a code redeemable for a free month or year of membership. Redemption creates a
          real subscription with a trial period - when the free period ends, Stripe automatically bills the
          member the plan&apos;s standard price unless they cancel first. No manual follow-up needed for members
          who have a card on file.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs text-neutral-500">Unredeemed codes outstanding</p>
          <p className="mt-1 text-2xl font-bold text-white">{unredeemedCount}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs text-neutral-500">Redeemed</p>
          <p className="mt-1 text-2xl font-bold text-white">{redeemedCount}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <form action={createGiveawayCodes} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Generate codes</h2>
          <div>
            <label className="label" htmlFor="gen-plan">Plan</label>
            <select id="gen-plan" name="plan_id" required className="input mt-1 w-full">
              {activePlans.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name ?? p.name} (${Number(p.price_monthly).toFixed(2)}/mo after free period)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="gen-period">Free period</label>
              <select id="gen-period" name="free_period" required className="input mt-1 w-full">
                <option value="month">1 month</option>
                <option value="year">1 year</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="gen-count">Number of codes</label>
              <input id="gen-count" name="count" type="number" min="1" max="50" defaultValue="1" required className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="gen-note">Note <span className="text-neutral-500 font-normal">(internal)</span></label>
            <input id="gen-note" name="note" type="text" placeholder="e.g. Grand Opening giveaway" className="input mt-1 w-full" />
          </div>
          <div>
            <label className="label" htmlFor="gen-expires">Code expires <span className="text-neutral-500 font-normal">(optional - if not redeemed by this date)</span></label>
            <input id="gen-expires" name="expires_at" type="date" className="input mt-1 w-full" />
          </div>
          <button type="submit" className="btn-primary w-full">Generate</button>
        </form>

        <GrantMembershipForm plans={activePlans} />
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold text-white">All codes</h2>
      {allCodes.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Free period</th>
                <th className="px-4 py-3">Redeemed by</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Code expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {allCodes.map((c) => {
                const plan = c.membership_plans as { display_name: string | null; name: string } | null
                const holder = c.profiles as { first_name: string; last_name: string } | null
                const status = c.redeemed_at ? "Redeemed" : c.active ? "Active" : "Revoked"
                return (
                  <tr key={c.id} className="border-b border-white/5 text-neutral-300">
                    <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3 text-xs">{plan?.display_name ?? plan?.name ?? "N/A"}</td>
                    <td className="px-4 py-3 text-xs capitalize">{c.free_period}</td>
                    <td className="px-4 py-3 text-xs">
                      {holder ? `${holder.first_name} ${holder.last_name}` : <span className="text-neutral-500">Unclaimed</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">{c.note ?? ""}</td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        status === "Redeemed" ? "bg-blue-500/20 text-blue-400"
                        : status === "Active" ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                      }`}>{status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {!c.redeemed_at && (
                        <form action={async () => { "use server"; await toggleGiveawayCode(c.id, !c.active) }}>
                          <button type="submit" className="text-xs text-neutral-500 hover:text-white transition-colors">
                            {c.active ? "Revoke" : "Reactivate"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No giveaway codes yet. Generate some above to get started.</p>
      )}
    </main>
  )
}
