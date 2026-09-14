"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/admin/guard"
import { findBookingAt, parseReportedTime } from "@/lib/incidents"

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  if (typeof v !== "string") return null
  const trimmed = v.trim()
  return trimmed === "" ? null : trimmed
}

export async function logIncident(formData: FormData) {
  const { serviceClient } = await requireAdmin()

  const description = str(formData, "description")
  if (!description) throw new Error("Description is required")

  const occurredRaw = str(formData, "occurred_at")
  const occurredAt = parseReportedTime(occurredRaw)
  const bayId = str(formData, "bay_id")

  // Attach the booking automatically. Nobody types a booking id by hand, and an
  // incident with no booking attached is an incident with no roster and no
  // camera window.
  const booking = await findBookingAt(serviceClient, bayId, occurredAt?.toISOString() ?? null)

  const { error } = await serviceClient.from("incidents").insert({
    occurred_at: occurredAt?.toISOString() ?? null,
    occurred_at_text: occurredRaw,
    time_confidence: str(formData, "time_confidence") ?? "approximate",
    reported_via: "admin",
    reporter_name: str(formData, "reporter_name"),
    reporter_phone: str(formData, "reporter_phone"),
    category: str(formData, "category") ?? "equipment_damage",
    severity: str(formData, "severity") ?? "minor",
    description,
    bay_id: bayId,
    booking_id: booking?.id ?? null,
    equipment_id: str(formData, "equipment_id"),
    reported_club: str(formData, "reported_club"),
    reported_set: str(formData, "reported_set"),
  })

  if (error) {
    console.error("[logIncident] insert failed", error)
    throw new Error("Failed to log incident")
  }

  revalidatePath("/admin/incidents")
}

export async function updateIncident(id: string, formData: FormData) {
  const { serviceClient } = await requireAdmin()

  const chargeRaw = str(formData, "charge_amount")
  const chargeAmount = chargeRaw ? Number(chargeRaw) : null
  if (chargeAmount !== null && Number.isNaN(chargeAmount)) {
    throw new Error("Charge amount must be a number")
  }

  await serviceClient
    .from("incidents")
    .update({
      charge_decision: str(formData, "charge_decision") ?? "pending",
      charge_amount: chargeAmount,
      video_reviewed: formData.get("video_reviewed") === "on",
      video_notes: str(formData, "video_notes"),
      resolution_notes: str(formData, "resolution_notes"),
      status: str(formData, "status") ?? "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  revalidatePath("/admin/incidents")
  revalidatePath(`/admin/incidents/${id}`)
}
