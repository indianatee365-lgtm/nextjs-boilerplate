import { createServiceClient } from "@/lib/supabase/server"

export type SmsGroup = "founders" | "members" | "all"

export const GROUP_LABELS: Record<SmsGroup, string> = {
  founders: "Founders Club",
  members: "All Members",
  all: "All Users",
}

export function isSmsGroup(value: string | undefined | null): value is SmsGroup {
  return value === "founders" || value === "members" || value === "all"
}

export interface SmsRecipient {
  phone: string
  firstName: string | null
}

// Every group here is gated on sms_consent - unlike an admin's individual
// reply/compose to one number, a group blast is a marketing-style send and
// needs real opt-in, not just an existing conversation.
export async function getGroupRecipients(group: SmsGroup): Promise<SmsRecipient[]> {
  const serviceClient = await createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = serviceClient as any

  if (group === "all") {
    const { data } = await db
      .from("profiles")
      .select("phone, first_name")
      .eq("sms_consent", true)
      .not("phone", "is", null)
    return (data ?? []).map((p: { phone: string; first_name: string | null }) => ({
      phone: p.phone,
      firstName: p.first_name,
    }))
  }

  let query = db
    .from("memberships")
    .select("plan_type, status, profiles(phone, first_name, sms_consent)")
    .eq("status", "active")
  if (group === "founders") {
    query = query.eq("plan_type", "founder")
  }

  const { data } = await query
  type Row = { profiles: { phone: string | null; first_name: string | null; sms_consent: boolean } | null }
  return ((data ?? []) as Row[])
    .map((row) => row.profiles)
    .filter((p): p is { phone: string; first_name: string | null; sms_consent: boolean } => !!p?.phone && p.sms_consent)
    .map((p) => ({ phone: p.phone, firstName: p.first_name }))
}
