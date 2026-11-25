// Carriers require every text to say who it's from. Jerrod's own style is
// "Hey Sir - this is jerrod from Tee365. ...", so the booking panel's text box
// only adds that line when the message doesn't already mention Tee365, and
// slots it in after a greeting ("Hey Ma'am -", "Hi John,") when there is one.
// Pure function, shared by the panel's preview and the server action, so what
// Jerrod sees under the box is exactly what gets sent.
const SENDER_ID = "this is jerrod from Tee365."

export function withSenderId(message: string): string {
  const m = message.trim()
  if (!m || /tee\s?365/i.test(m)) return m
  // Greeting = "Hey/Hi/Hello [name]" then a dash, comma, colon or "!". Titles
  // like "Mrs." are allowed in the name; any other period ends the match.
  const greeting = m.match(/^((?:hey|hi|hello|good (?:morning|afternoon|evening))\b(?:\b(?:mr|mrs|ms|dr)\.|[^\n.!?,:-]){0,30}?\s*[-,:!]\s*)/i)
  if (!greeting) return `This is jerrod from Tee365. ${m}`
  const rest = m.slice(greeting[1].length)
  const head = greeting[1].endsWith(" ") ? greeting[1] : greeting[1] + " "
  const id = head.trimEnd().endsWith("!") ? "T" + SENDER_ID.slice(1) : SENDER_ID
  return rest ? `${head}${id} ${rest[0].toUpperCase()}${rest.slice(1)}` : `${head}${id}`
}
