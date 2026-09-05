import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import SettingsToggle from "./SettingsToggle"

export const metadata = { title: "Settings | Tee365 Admin" }
export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if (profile?.role !== "admin") redirect("/account")

  const { data: settings } = await serviceClient.from("admin_settings").select("key, value")
  const settingsMap = Object.fromEntries((settings ?? []).map((s: { key: string; value: boolean }) => [s.key, s.value]))

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-neutral-500">Admin-only toggles - safe to flip anytime, no code changes needed.</p>

      <div className="mt-6 space-y-3">
        <SettingsToggle
          settingKey="notify_new_bookings"
          label="Text me when someone books"
          description="Sends your phone a text for every new confirmed booking (web, phone, and paid checkout). Turn off if it's a busy day and it's too much."
          initialValue={settingsMap.notify_new_bookings ?? true}
        />
        <SettingsToggle
          settingKey="notify_restart_clicks"
          label="Text me when a customer clicks restart"
          description={'Sends your phone a text whenever a customer taps the on-screen "Simulator issue? Click to restart" button, with what was actually running at that moment logged for you to review.'}
          initialValue={settingsMap.notify_restart_clicks ?? true}
        />
        <SettingsToggle
          settingKey="notify_crash_restarts"
          label="Text me when the simulator auto-recovers from a crash"
          description="Sends your phone a text whenever a bay automatically detects and recovers from a mid-rental crash, with which process actually dropped out logged for you to review."
          initialValue={settingsMap.notify_crash_restarts ?? true}
        />
        <SettingsToggle
          settingKey="notify_no_shot_alert"
          label="Text me when a ready customer isn't getting shots read"
          description="Sends your phone a text the moment a bay's been ready for several minutes with zero shots captured - catches a stuck customer while it's happening, not after they've already given up."
          initialValue={settingsMap.notify_no_shot_alert ?? true}
        />
      </div>
    </main>
  )
}
