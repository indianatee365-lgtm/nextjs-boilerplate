import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Members | Tee365 Admin" }

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const { plan } = await searchParams
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  let query = serviceClient
    .from("memberships")
    .select(`
      id, status, started_at, current_period_end, cancelled_at, plan_type,
      membership_plans(name, slug),
      profiles!user_id(first_name, last_name, phone, id)
    `)
    .order("started_at", { ascending: false })
  if (plan === "founder" || plan === "eagle" || plan === "birdie") {
    query = query.eq("plan_type", plan)
  }
  const { data: memberships } = await query

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white mb-4">Members</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { slug: "", label: "All" },
          { slug: "founder", label: "Founder’s" },
          { slug: "eagle", label: "Eagle" },
          { slug: "birdie", label: "Birdie" },
        ].map(f => (
          <a key={f.slug || "all"} href={f.slug ? `/admin/members?plan=${f.slug}` : "/admin/members"}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              (plan ?? "") === f.slug ? "text-black" : "bg-white/5 text-neutral-300 border border-white/10 hover:bg-white/10"
            }`}
            style={(plan ?? "") === f.slug ? { backgroundColor: "var(--brand)" } : undefined}
          >{f.label}</a>
        ))}
      </div>

      {memberships && memberships.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Renews</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => {
                const p = m.profiles as { first_name: string; last_name: string; phone: string | null; id: string } | null
                const plan = m.membership_plans as { name: string } | null
                const userHref = p?.id ? `/admin/users/${p.id}` : "#"
                return (
                  <tr key={m.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-3">
                      <Link href={userHref} className="block hover:text-brand">
                        <p>{p?.first_name} {p?.last_name}</p>
                        <p className="text-xs text-neutral-500">{p?.phone ?? "N/A"}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3"><Link href={userHref} className="block">{plan?.name ?? "N/A"}</Link></td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.status === "active" ? "bg-green-500/20 text-green-400" :
                        m.status === "past_due" ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                      }`}>{m.status}</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{new Date(m.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-4 py-3 text-neutral-400">{m.current_period_end ? new Date(m.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No members yet.</p>
      )}
    </main>
  )
}
