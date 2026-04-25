import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import ResetPasswordForm from "./ResetPasswordForm"

export const metadata = { title: "Set New Password | Tee365" }

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/forgot-password")

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Set new password</h1>
        <p className="mt-1 text-sm text-neutral-400">Choose a strong password for your account.</p>
      </div>
      <ResetPasswordForm />
    </main>
  )
}
