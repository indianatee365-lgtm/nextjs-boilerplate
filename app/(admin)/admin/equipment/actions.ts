"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin/guard"

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  if (typeof v !== "string") return null
  const trimmed = v.trim()
  return trimmed === "" ? null : trimmed
}

export async function addEquipment(formData: FormData) {
  const { serviceClient } = await requireAdmin()

  const tag = str(formData, "tag")?.toUpperCase()
  const name = str(formData, "name")

  if (!tag || !name) throw new Error("Tag and name are required")

  const costRaw = str(formData, "replacement_cost")
  const cost = costRaw ? Number(costRaw) : null
  if (cost !== null && Number.isNaN(cost)) throw new Error("Replacement cost must be a number")

  const { error } = await serviceClient.from("equipment").insert({
    tag,
    name,
    club_type: str(formData, "club_type"),
    hand: str(formData, "hand"),
    bay_id: str(formData, "bay_id"),
    replacement_cost: cost,
    acquired_on: str(formData, "acquired_on"),
    baseline_photo_url: str(formData, "baseline_photo_url"),
    notes: str(formData, "notes"),
  })

  if (error) {
    if (error.code === "23505") throw new Error(`Tag ${tag} already exists`)
    throw new Error("Failed to add equipment")
  }

  revalidatePath("/admin/equipment")
}

export async function setEquipmentStatus(id: string, status: string) {
  const { serviceClient } = await requireAdmin()

  await serviceClient
    .from("equipment")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)

  revalidatePath("/admin/equipment")
}
