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

/** To the captain right after they sign a team up. */
export async function sendLeagueCaptainSignedUpEmail({
  to,
  firstName,
  teamName,
  teeTime,
  partnerName,
  link,
  waitlisted,
  payingForBoth,
  perWeek,
}: {
  to: string
  firstName: string
  teamName: string
  teeTime: string
  partnerName: string
  link: string
  waitlisted: boolean
  payingForBoth: boolean
  perWeek: number
}) {
  const fee = payingForBoth
    ? `You're covering both of you, so you'll be charged $${perWeek * 2} each league night ($${perWeek} for you and $${perWeek} for ${escapeHtml(partnerName)}).`
    : `You'll each be charged $${perWeek} on each league night.`
  await sendFounderMessage({
    to,
    firstName,
    subject: waitlisted ? `Team ${teamName} is on the league waitlist` : `Team ${teamName} is signed up. One step left.`,
    heading: waitlisted ? "You're on the waitlist" : "One step left: your partner",
    paragraphs: [
      waitlisted
        ? `Both tee times are full, so team <strong>${escapeHtml(teamName)}</strong> is on the waitlist. We'll text you the moment a spot opens.`
        : `Team <strong>${escapeHtml(teamName)}</strong> is holding a spot at the <strong>${teeTime}</strong> tee time for the Thursday Night League.`,
      `Your team is confirmed once ${escapeHtml(partnerName)} accepts. Send them this link if you haven't already: <a href="${link}" style="color:#4ade80;">${link}</a>`,
      fee,
      "Week one is Thursday, October 22. Every rule is written down on the rules page, so give it a read before then.",
    ],
    ctaText: "Read the league rules",
    ctaUrl: "https://tee365.org/league/rules",
    kind: "league-captain-signed-up",
  })
}

/** To both players when the partner accepts and the team is complete. */
export async function sendLeagueTeamConfirmedEmail({
  to,
  firstName,
  teamName,
  teeTime,
  teammateName,
  waitlisted,
}: {
  to: string
  firstName: string
  teamName: string
  teeTime: string
  teammateName: string
  waitlisted: boolean
}) {
  await sendFounderMessage({
    to,
    firstName,
    subject: waitlisted ? `Team ${teamName} is complete and on the waitlist` : `Team ${teamName} is confirmed for Thursday Night League`,
    heading: waitlisted ? "Your team is complete" : "You're in",
    paragraphs: [
      waitlisted
        ? `You and ${escapeHtml(teammateName)} are team <strong>${escapeHtml(teamName)}</strong>. Both tee times are full right now, so you're on the waitlist. We'll text you the moment a spot opens.`
        : `You and ${escapeHtml(teammateName)} are team <strong>${escapeHtml(teamName)}</strong>, confirmed for the <strong>${teeTime}</strong> tee time.`,
      "Week one is Thursday, October 22. The night before each league night you'll get a text with your tee time, bay, opponent and the course.",
      "Weeks 1 and 2 are learning weeks. After that, A/B match play begins. Every rule is on the rules page.",
    ],
    ctaText: "Read the league rules",
    ctaUrl: "https://tee365.org/league/rules",
    kind: "league-team-confirmed",
  })
}
