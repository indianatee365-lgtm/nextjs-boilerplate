import { sendFounderMessage } from "@/lib/resend/email"

/**
 * League emails, in Jerrod's voice through the personal-message template.
 *
 * The partner invite is email only, never a text from Tee365: the partner has
 * not agreed to texts from us. The captain shares the link from their own
 * phone instead (the signup page gives them a "Text your partner" button).
 */
export async function sendLeaguePartnerInviteEmail({
  to,
  partnerName,
  captainName,
  teamName,
  teeTime,
  link,
  captainPays = false,
}: {
  to: string
  partnerName: string
  captainName: string
  teamName: string
  teeTime: string
  link: string
  captainPays?: boolean
}) {
  await sendFounderMessage({
    to,
    firstName: partnerName.split(" ")[0] || partnerName,
    subject: `${captainName} wants you as their partner in the Tee365 Thursday Night League`,
    heading: "You've been picked",
    paragraphs: [
      `${captainName} signed up team <strong>${escapeHtml(teamName)}</strong> for the Tee365 Thursday Night League and named you as their partner.`,
      `It's two-person teams, A/B match play, 9 holes on a different course every week, Thursday nights at ${teeTime}, October 22 to December 17 (no league on Thanksgiving). $30 a week, and 100% of the pot is paid out in cash.`,
      captainPays
        ? `${captainName} is covering your weekly fee. Your team is confirmed once you accept; you'll just need a Tee365 account. It takes a couple of minutes.`
        : "Your team is confirmed once you accept. You'll need a Tee365 account and a card on file for the weekly fee. It takes a couple of minutes.",
    ],
    ctaText: "Accept and join the team",
    ctaUrl: link,
    kind: "league-partner-invite",
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
