import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import AccountDashboard from "@/app/(auth)/account/AccountDashboard"

export const metadata = { title: "Customer dashboard view | Tee365 Admin" }
export const dynamic = "force-dynamic"

export default async function AdminUserDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: meProfile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((meProfile as { role: string } | null)?.role !== "admin") redirect("/account")

  // Only what the admin banner itself needs. Everything below the banner is
  // rendered by AccountDashboard, which does its own fetching for this user.
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    serviceClient.from("profiles").select("first_name, last_name").eq("id", id).single(),
    serviceClient.auth.admin.getUserById(id),
  ])
  if (!profile) notFound()

  const targetEmail = authUser?.user?.email ?? ""

  return (
    <>
      {/* Admin context: interactive */}
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">Admin view &middot; read only</p>
            <p className="text-sm text-neutral-200 mt-1">Viewing as <strong>{profile.first_name} {profile.last_name}</strong> &middot; {targetEmail}</p>
          </div>
          <Link href={`/admin/users/${id}`} className="text-xs text-neutral-300 hover:text-white">&larr; Back to user</Link>
        </div>
      </div>

      {/* Faithful mirror of /account: same component, rendered non-interactive
          and wrapped inert. Clicks and forms blocked; text stays selectable. */}
      <div inert>
        <AccountDashboard userId={id} email={targetEmail} interactive={false} />
      </div>
    </>
  )
}
