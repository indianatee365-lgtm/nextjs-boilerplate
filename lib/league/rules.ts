/**
 * The Thursday Night League rulebook, in one place. /league/rules renders all
 * of it and /league summarizes it, so the two can't disagree.
 *
 * Every decision Jerrod made on 2026-10-07 is written down here in plain
 * words, because an unclear rule was the root of every complaint in Net
 * Par's "what we got wrong" letter. If a rule changes, change it here.
 */

export interface CourseNight {
  date: string // YYYY-MM-DD
  course: string
  nine: "Front 9" | "Back 9"
  note: string
}

// Draft rotation. Easier, wider courses in the two learning weeks, a marquee
// course for the finale. Every bay plays the same course on the same night.
// Course names are as listed in GSPro's course directory; each one must be
// confirmed as installed on all four bays before it is published.
export const COURSE_SCHEDULE: CourseNight[] = [
  { date: "2026-10-22", course: "Payne's Valley", nine: "Front 9", note: "Learning week. Wide and forgiving." },
  { date: "2026-10-29", course: "Mammoth Dunes", nine: "Front 9", note: "Learning week. Huge fairways." },
  { date: "2026-11-05", course: "St Andrews (Old Course)", nine: "Front 9", note: "First A/B match week." },
  { date: "2026-11-12", course: "Arcadia Bluffs", nine: "Front 9", note: "" },
  { date: "2026-11-19", course: "Bandon Trails", nine: "Front 9", note: "" },
  { date: "2026-12-03", course: "Streamsong Blue", nine: "Back 9", note: "" },
  { date: "2026-12-10", course: "Muirfield Village", nine: "Back 9", note: "" },
  { date: "2026-12-17", course: "Pebble Beach", nine: "Front 9", note: "Finale. The marquee course." },
]

// Every bay, every league night. Drafted from published simulator league
// rules (Chesapeake Golf's sim league, GSPro's own options) and set toward
// the forgiving end, because this is a weeknight league, not a tour event.
export const SIM_SETTINGS: [string, string][] = [
  ["Gimmes", "Auto-putt inside 8 feet (counts as one putt). Putt everything outside 8 feet."],
  ["Green speed", "Stimp 11"],
  ["Greens and fairways", "Medium firm"],
  ["Pin positions", "Medium"],
  ["Wind", "Calm (0 to 5 mph)"],
  ["Mulligans", "Off. Only a clear misread by the simulator is re-hit (see Misreads)."],
  ["Tees", "Everyone plays the same tees, except players who chose forward tees at signup."],
]

export interface RuleSection {
  title: string
  rules: string[]
}

export const RULES: RuleSection[] = [
  {
    title: "The basics",
    rules: [
      "Eight Thursdays: Oct 22, Oct 29, Nov 5, Nov 12, Nov 19, Dec 3, Dec 10 and the finale on Dec 17. No league on Thanksgiving (Nov 26).",
      "Two tee times: 5:30pm and 7:30pm. Your team keeps its tee time all season.",
      "Teams of two. Two teams share a bay, four players, 9 holes, two hours.",
      "Every player plays their own ball and every score is recorded, hole by hole.",
      "Up to 8 teams per tee time, 16 teams and 32 players in all.",
    ],
  },
  {
    title: "Weeks 1 and 2: learning weeks",
    rules: [
      "No A/B matches yet. Everyone plays their round and learns GSPro and the league routine.",
      "Your team still plays the other team in your bay: the lower combined net score (using starting handicaps) earns 4 points, a tie earns 2 each. That way the learning weeks count, and nobody gains anything by playing badly on purpose.",
      "Both rounds count toward your handicap and toward the low gross prize.",
    ],
  },
  {
    title: "Weeks 3 to 8: A/B match play",
    rules: [
      "After week 2, each team's lower league handicap becomes its A player and the higher becomes its B player. That stays fixed for the rest of the season.",
      "Each week your A plays their A and your B plays their B. Everyone still just plays their round; the matches are worked out from the scorecards afterwards.",
      "Each hole, the lower net score wins 1 point. A tied hole is half a point each. That's 9 points in the A match and 9 in the B match.",
      "The team with the lower combined net score for the night earns 2 more points. A tie is 1 each. 20 points are up for grabs every match week.",
      "Weeks 3 to 7 you play a different team from your tee time each week.",
      "Week 8 is the finale: a position round inside each tee time (1st plays 2nd, 3rd plays 4th, and so on).",
      "Standings are total points for the season, across both tee times.",
    ],
  },
  {
    title: "Handicaps",
    rules: [
      "Starting handicap: you give it at signup. Your 9-hole number is half your 18-hole handicap. No official handicap? Tell us your typical 18-hole score and we'll work it out. The commissioner can adjust any starting handicap.",
      "From week 3, your league handicap comes from your own league scores: 90% of the average of your best 2 of your last 4 rounds, measured against par.",
      "For handicap purposes, no hole counts worse than net double bogey.",
      "Your league handicap can't rise more than 3 strokes above your starting handicap without the commissioner's OK. That, and best-2-of-4, is what stops sandbagging.",
      "Strokes in a match: the higher handicap player gets the difference, one stroke per hole on the hardest holes, using the course's hole handicaps from the GSPro scorecard.",
      "Handicaps update automatically every week. You'll always see yours and your opponent's before you play.",
    ],
  },
  {
    title: "On the simulator",
    rules: [
      "Every bay plays the same course with the same settings on the same night. The settings sheet is below and is checked on every bay before league night.",
      "Misreads: if the simulator clearly misreads a shot (didn't track it, or recorded something wildly different from what everyone saw), re-hit it, as long as the other team in your bay agrees. Anything else, you play it.",
      "No practice swings into the screen between competition shots.",
      "Pace: finish inside your two hours. The 7:30 group is waiting on you. Holes not finished in time score as double bogey.",
    ],
  },
  {
    title: "Scores",
    rules: [
      "Scores are entered right after the round, hole by hole, and the other team in your bay confirms them.",
      "If nobody disputes a score within 12 hours, it stands.",
      "Disputes go to the commissioner, whose call is final.",
      "Standings and the leaderboard update the same night.",
    ],
  },
  {
    title: "Missing a week",
    rules: [
      "You can send a sub. Subs need their own Tee365 account and must sign the waiver, because they're in the building. Subs play free.",
      "A sub plays at the absent player's handicap, so a sub can never make a team stronger. A sub's scores don't change anyone's handicap.",
      "No sub: the absent player's match is forfeited. Their opponent still plays their round and wins all 9 points of that match. The forfeiting team can't win that night's 2 team points.",
      "Nobody shows from a team: the other team wins all 20 points, as long as they play their rounds.",
      "Your card is charged for every league night, played or missed.",
    ],
  },
  {
    title: "Money",
    rules: [
      "$30 per player, charged to your card on file each league night, 8 nights. $25 is bay time and $5 goes into the pot.",
      "One player can pay for both. The captain chooses this at signup and is charged $60 each league night; their partner doesn't need a card.",
      "Pull out before week one and nothing is charged. Once week one tees off, you're in for the season.",
      "If Tee365 has to cancel a league night, nobody is charged for it and no points are awarded. The season isn't extended.",
      "100% of the pot is paid out in cash. The pot grows each week and its running total is on the leaderboard.",
    ],
  },
  {
    title: "Prizes",
    rules: [
      "Most points (team): 50% of the pot, cash.",
      "Low gross (team): 50% of the pot, cash. That's the team's combined gross per round, averaged over the rounds both rostered players played. A team needs at least 6 of 8 such rounds to qualify; rounds with a sub don't count.",
      "One cash prize per team. A team that wins both takes the points prize, and the gross prize goes to the next team.",
      "2nd in points: a year of Eagle membership for each player. Already a member? 10 free hours each instead.",
      "3rd in points: 4 free hours for each player.",
      "Free hours are good through March 31.",
      "Points ties are broken by the head-to-head result, then by lower season gross. Still tied, the prize is split.",
      "Cash is paid to each player individually at the finale.",
    ],
  },
  {
    title: "The rest",
    rules: [
      "Your commissioner is Jerrod, the owner. Every rules call is his, and it's final.",
      "Every week: a text the night before with your tee time, bay and course, and a Friday recap with results and standings.",
      "Players often run their own skins game. Tee365 isn't involved and doesn't hold any money for it.",
      "No alcohol at Tee365. Zero tolerance. Bring your own snacks and soft drinks, no glass.",
      "Clubs: bring your own or use our loaners, free.",
    ],
  },
]

export const FAQ: [string, string][] = [
  ["Do I need a partner to sign up?", "Yes. The captain signs up the team and sends their partner an invite link. The team is confirmed when the partner accepts."],
  ["I don't have an official handicap.", "That's fine, most people don't. Tell us your typical 18-hole score at signup and we'll set your starting handicap from it."],
  ["Can I sandbag the learning weeks?", "It won't work. The learning weeks still earn points, your handicap uses your best 2 of your last 4 rounds, and it can't climb more than 3 strokes above your starting number without the commissioner's OK."],
  ["Who's my opponent each week?", "The other team in your bay. You'll get it by text the night before, with your bay and the course."],
  ["Can one of us pay for both?", "Yes. The captain ticks \"Paying for both?\" at signup and is charged $60 each league night. Their partner still signs up (account, waiver, starting handicap) but doesn't need a card."],
  ["What if I'm sick?", "Send a sub, or your opponent wins your match. Either way your card is charged that night."],
  ["Is my weekly fee refundable?", "Only if you pull out before week one, or if Tee365 cancels a night."],
  ["How is the cash paid?", "To each player individually at the finale."],
  ["Why Thursday?", "So you can play here even if you're in a league somewhere else on another night."],
]
