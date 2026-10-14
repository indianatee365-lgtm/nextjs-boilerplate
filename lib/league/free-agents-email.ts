import { sendFounderMessage } from "@/lib/resend/email"
import { captainSignupUrl, type FreeAgent } from "@/lib/league/free-agents"

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there"

/** Emails both players about the pairing. Returns how many emails went out. */
export async function emailPairing(captain: FreeAgent, partner: FreeAgent): Promise<number> {
  let sent = 0
  const phone = (p: FreeAgent) => (p.phone ? ` (${p.phone})` : "")
  if (captain.email) {
    await sendFounderMessage({
      to: captain.email,
      firstName: firstName(captain.name),
      subject: "You have a league partner",
      heading: "You have a Thursday Night League partner",
      paragraphs: [
        `You're paired with ${partner.name}${phone(partner)}. Say hello!`,
        `You're the captain, so the last step is yours: sign up the team using the button below. ${firstName(partner.name)} is already filled in as your partner and gets an invite link to accept.`,
        "Nothing is charged until your team is confirmed.",
      ],
      ctaText: "Sign up our team",
      ctaUrl: captainSignupUrl(partner),
      kind: "league-free-agent-paired",
    })
    sent++
  }
  if (partner.email) {
    await sendFounderMessage({
      to: partner.email,
      firstName: firstName(partner.name),
      subject: "You have a league partner",
      heading: "You have a Thursday Night League partner",
      paragraphs: [
        `You're paired with ${captain.name}${phone(captain)}. Say hello!`,
        `${firstName(captain.name)} is signing up the team, and you'll get an invite link to accept. You'll need a Tee365 account and a card on file, the same as every player.`,
        "Nothing is charged until your team is confirmed.",
      ],
      kind: "league-free-agent-paired",
    })
    sent++
  }
  return sent
}
