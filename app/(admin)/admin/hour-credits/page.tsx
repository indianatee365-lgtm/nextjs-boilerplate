import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { createHourCreditCodes, grantHoursByEmail, toggleHourCredit } from "./actions"

export const metadata = { title: "Hour Credits | Tee365 Admin" }

export default async function AdminHourCreditsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: credits } = await serviceClient
    .from("hour_credits")
    .select("id, code, hours, hours_remaining, reason, expires_at, active, redeemed_at, created_at, profiles!hour_credits_user_id_fkey(first_name, last_name)")
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Hour Credits</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Give away free playing time. Codes can be handed out at raffles and sponsor events;
          hours apply automatically at checkout and reduce billable time, not dollars.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Generate raffle codes */}
        <form action={createHourCreditCodes} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Generate codes</h2>
          <p className="text-xs text-neutral-500">For raffles and giveaways. Print or email the code; the winner redeems it on their account page.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="gen-hours">Hours each</label>
              <input id="gen-hours" name="hours" type="number" step="0.5" min="0.5" max="24" defaultValue="2" required className="input mt-1" />
            </div>
            <div>
              <label className="label" htmlFor="gen-count">Number of codes</label>
              <input id="gen-count" name="count" type="number" min="1" max="50" defaultValue="1" required className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="gen-reason">Reason / sponsor</label>
            <input id="gen-reason" name="reason" type="text" placeholder="e.g. Chamber raffle" className="input mt-1" />
          </div>
          <div>
            <label className="label" htmlFor="gen-expires">Expires (optional)</label>
            <input id="gen-expires" name="expires_at" type="date" className="input mt-1" />
          </div>
          <button type="submit" className="btn-primary w-full">Generate</button>
        </form>

        {/* Direct grant */}
        <form action={grantHoursByEmail} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Grant to an account</h2>
          <p className="text-xs text-neutral-500">Adds hours directly to an existing customer account, no code needed.</p>
          <div>
            <label className="label" htmlFor="grant-email">Customer email</label>
            <input id="grant-email" name="email" type="email" placeholder="customer@example.com" required className="input mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="grant-hours">Hours</label>
              <input id="grant-hours" name="hours" type="number" step="0.5" min="0.5" max="24" defaultValue="2" required className="input mt-1" />
            </div>
            <div>
              <label className="label" htmlFor="grant-expires">Expires (optional)</label>
              <input id="grant-expires" name="expires_at" type="date" className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="grant-reason">Reason</label>
            <input id="grant-reason" name="reason" type="text" placeholder="e.g. Service recovery" className="input mt-1" />
          </div>
          <button type="submit" className="btn-primary w-full">Grant hours</button>
        </form>
      </div>

      <h2 className="mt-10 mb-3 text-sm font-semibold text-white">All credits</h2>
      {credits && credits.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Holder</th>
                <th className="px-4 py-3">Hours left</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => {
                const holder = c.profiles as { first_name: string; last_name: string } | null
                return (
                  <tr key={c.id} className="border-b border-white/5 text-neutral-300">
                    <td className="px-4 py-3 font-mono text-xs">{c.code ?? "direct grant"}</td>
                    <td className="px-4 py-3 text-xs">
                      {holder ? `${holder.first_name} ${holder.last_name}` : <span className="text-neutral-500">Unclaimed</span>}
                    </td>
                    <td className="px-4 py-3">{Number(c.hours_remaining)} / {Number(c.hours)}</td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">{c.reason ?? ""}</td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <form action={async () => { "use server"; await toggleHourCredit(c.id, !c.active) }}>
                        <button type="submit" className="text-xs text-neutral-500 hover:text-white transition-colors">
                          {c.active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No hour credits yet. Generate codes above to get started.</p>
      )}
    </main>
  )
}
