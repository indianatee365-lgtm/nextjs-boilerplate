import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")

  if (!token) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  const supabase = await createServiceClient()
  const { error } = await supabase
    .from("waitlist")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("unsubscribed_at", null)

  if (error) {
    console.error("[unsubscribe] error:", error)
  }

  return NextResponse.redirect(new URL("/unsubscribed", req.url))
}
