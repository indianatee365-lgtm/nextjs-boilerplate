import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import CreateCouponModal from "./CreateCouponModal"
import { toggleCoupon } from "./actions"

export const metadata = { title: "Coupons | Tee365 Admin" }

export default async function AdminCouponsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: coupons } = await serviceClient
    .from("coupons")
    .select("id, name, code, discount_type, discount_value, max_uses, max_uses_per_user, uses_count, active, expires_at")
    .order("created_at", { ascending: false })

  const fmt = (c: typeof coupons extends (infer T)[] | null ? T : never) =>
    c.discount_type === "percent" ? `${c.discount_value}%` : `$${Number(c.discount_value).toFixed(2)}`

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-white">Coupons</h1>
        <CreateCouponModal />
      </div>

      {coupons && coupons.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Uses</th>
                <th className="px-4 py-3">Per customer</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-white/5 text-neutral-300">
                  <td className="px-4 py-3 font-mono font-medium">{c.code}</td>
                  <td className="px-4 py-3 text-neutral-400 text-xs">{c.name ?? "N/A"}</td>
                  <td className="px-4 py-3">{fmt(c)}</td>
                  <td className="px-4 py-3">{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                  <td className="px-4 py-3 text-neutral-400">{c.max_uses_per_user ?? "Unlimited"}</td>
                  <td className="px-4 py-3 text-neutral-400">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <form action={async () => { "use server"; await toggleCoupon(c.id, !c.active) }}>
                      <button type="submit" className="text-xs text-neutral-500 hover:text-white transition-colors">
                        {c.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No coupons yet. Issue one to get started.</p>
      )}
    </main>
  )
}
