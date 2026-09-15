import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AccountDashboard from "./AccountDashboard"

export const metadata = { title: "My Account | Tee365" }

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ membership?: string }>
}) {
  const { membership: membershipParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  return (
    <AccountDashboard
      userId={user.id}
      email={user.email ?? ""}
      interactive
      showJoinedBanner={membershipParam === "joined"}
    />
  )
}
