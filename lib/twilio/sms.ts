import twilio from "twilio"

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function sendBookingConfirmation({
  to,
  firstName,
  bayName,
  startsAt,
  endsAt,
  accessCode,
}: {
  to: string
  firstName: string
  bayName: string
  startsAt: Date
  endsAt: Date
  accessCode: string
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
    `🔐 Access code: ${accessCode}`,
    `Your code activates 5 minutes before your session.`,
    `Questions? info@tee365.org`,
  ].join("\n")

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
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
    to,
  })
}
