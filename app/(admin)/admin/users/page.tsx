import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import UsersTable from "./UsersTable"

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
      <UsersTable profiles={profiles ?? []} />
    </main>
  )
}
