import { NextRequest, NextResponse } from "next/server"
import { sendAccessCodeReminder } from "@/lib/telnyx/sms"

// TEMPORARY - manual test of the live access-code SMS template. Delete after
// confirming delivery, same as the founders-day-notice test route pattern.
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key")
  if (key !== "tee365-test-8f2a1c94") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await sendAccessCodeReminder({
    to: "+15749990622",
    firstName: "Jerrod",
    bayName: "Bay 4",
    accessCode: "482913",
    startsAt: new Date(Date.now() + 15 * 60000),
  })

  return NextResponse.json({ ok: true, sentTo: "+15749990622" })
}
