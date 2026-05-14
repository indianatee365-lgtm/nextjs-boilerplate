function normalizePhone(phone: string): string {
  return phone.startsWith("+") ? phone : "+" + phone
}

async function sendSms(to: string, body: string) {
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.TELNYX_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.TELNYX_PHONE_NUMBER,
      to: normalizePhone(to),
      text: body,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error("Telnyx SMS failed: " + JSON.stringify(err))
  }
}

export async function sendBookingConfirmation({
  to,
  firstName,
  bayName,
  startsAt,
  endsAt,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
}) {
  const startStr = startsAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })
  const endStr = endsAt.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  const message = [
    "Hi " + firstName + "! Your Tee365 booking is confirmed.",
    "Bay: " + bayName,
    startStr + " - " + endStr,
    "Your access code will be sent 10-20 minutes before your session.",
    "Questions? info@tee365.org",
    "Reply STOP to opt out, HELP for info. Msg & data rates may apply.",
  ].join("\n")

  await sendSms(to, message)
}

export async function sendAccessCodeReminder({
  to,
  firstName,
  bayName,
  accessCode,
  startsAt,
}: {
  to: string
  firstName: string
  bayName: string
  accessCode: string
  startsAt: Date
}) {
  const timeStr = startsAt.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Indiana/Indianapolis",
  })

  await sendSms(
    to,
    "Tee365 reminder: " + firstName + ", your session at " + bayName + " starts at " + timeStr + ".\nAccess code: " + accessCode + "\nReply STOP to opt out."
  )
}