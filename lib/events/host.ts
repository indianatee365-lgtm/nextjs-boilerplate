/**
 * Event host pricing, kept free of server imports so the admin form can show
 * the total live. The host is booked by the hour from the event start; the
 * last block is shorter if the event is (a 30-minute block is half the rate).
 */
export function hostBlocks(durationMinutes: number): { offset: number; minutes: number }[] {
  const out: { offset: number; minutes: number }[] = []
  for (let o = 0; o < durationMinutes; o += 60) out.push({ offset: o, minutes: Math.min(60, durationMinutes - o) })
  return out
}

export function hostAmountFor(rate: number, chosen: number[], durationMinutes: number): number {
  const blocks = hostBlocks(durationMinutes).filter((b) => chosen.includes(b.offset))
  return Math.round(blocks.reduce((t, b) => t + (rate * b.minutes) / 60, 0) * 100) / 100
}
