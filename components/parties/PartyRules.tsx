/**
 * How party tickets work. One shared block so the rules read the same on the
 * parties page, every party page and next to the buy button (Jerrod,
 * 2026-10-11: one ticket per person of any age, because the room has a hard
 * capacity, and parties are per person where normal bookings are per bay).
 */
export const PARTY_RULES: { title: string; body: string }[] = [
  {
    title: "One ticket, one person, any age",
    body: "Everyone who comes through the door needs their own ticket, kids included. A ticket for one admits one.",
  },
  {
    title: "Why we're strict about it",
    body: "The room holds 49 people, and we sell exactly that many tickets so everyone who paid gets in and has room to play. Extra guests without tickets would push us over capacity and take space from people who bought one.",
  },
  {
    title: "Parties are per person, not per bay",
    body: "Regular Tee365 bookings are by the bay: one price for your group. Parties work differently. Your ticket gets you into the whole party, and everyone shares the bays, the games and the contests.",
  },
  {
    title: "Bringing a group?",
    body: "Buy a ticket for each person in it (up to 5 per order; place another order for more). Your name goes on the guest list with the number of tickets you bought.",
  },
]

export const PARTY_ACK = "I understand each ticket admits one person, of any age, and I'm buying one for everyone in my group."

export default function PartyRules({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className={`${compact ? "text-sm" : "text-base"} font-semibold text-white`}>How party tickets work</h2>
      <div className="mt-3 space-y-3">
        {PARTY_RULES.map((r) => (
          <div key={r.title}>
            <p className="text-sm font-semibold text-white">{r.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-neutral-300">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
