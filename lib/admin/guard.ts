import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

/**
 * Every admin page and server action repeats the same three steps: get the
 * session, look the role up with the service client, bounce anyone who is not
 * an admin. This is that, once.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.role !== "admin") redirect("/account")

  return { user, serviceClient }
}
