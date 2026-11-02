"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin/guard"
import { createGuestCode, revokeGuestCode, type GuestCode } from "@/lib/access-control/guest-codes"

export async function createGuestCodeAction(formData: FormData): Promise<GuestCode> {
  const { user, serviceClient } = await requireAdmin()
  const name = ((formData.get("name") as string) || "").trim()
  const date = ((formData.get("date") as string) || "").trim()
  if (!name) throw new Error("Give the code a name")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Pick a day")

  const code = await createGuestCode(serviceClient, user.id, name, date)
  revalidatePath("/admin/door")
  return code
}

export async function revokeGuestCodeAction(id: string): Promise<void> {
  const { serviceClient } = await requireAdmin()
  await revokeGuestCode(serviceClient, id)
  revalidatePath("/admin/door")
}
