import twilio from "twilio"

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

function normalizePhone(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`
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
    `Hi ${firstName}! Your Tee365 booking is confirmed.`,
    `📍 ${bayName}`,
    `🕐 ${startStr} – ${endStr}`,
    `Your access code will be sent to this number 10–20 minutes before your session begins.`,
    `Questions? info@tee365.org`,
  ].join("\n")

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: normalizePhone(to),
  })
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

  await client.messages.create({
    body: `Tee365 reminder: ${firstName}, your session at ${bayName} starts at ${timeStr}.\n🔐 Access code: ${accessCode}`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: normalizePhone(to),
  })
}
