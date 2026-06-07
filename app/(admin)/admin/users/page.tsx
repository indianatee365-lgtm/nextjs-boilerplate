import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

export const metadata = { title: "Users | Tee365 Admin" }

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: profiles } = await serviceClient
    .from("profiles")
    .select("id, first_name, last_name, phone, role, created_at")
    .order("created_at", { ascending: false })

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white mb-8">Users</h1>

      {profiles && profiles.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-white/5 text-neutral-300 hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3"><Link href={`/admin/users/${p.id}`} className="block hover:text-brand">{p.first_name} {p.last_name}</Link></td>
                  <td className="px-4 py-3"><Link href={`/admin/users/${p.id}`} className="block">{p.phone ?? "N/A"}</Link></td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${p.id}`} className="block">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.role === "admin" ? "bg-brand/20 text-brand" : "bg-white/10 text-neutral-400"
                      }`}>{p.role ?? "user"}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400"><Link href={`/admin/users/${p.id}`} className="block">{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No users yet.</p>
      )}
    </main>
  )
}
