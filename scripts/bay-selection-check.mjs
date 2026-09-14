// Behaviour checks for lib/bookings/bay-selection.ts.
//
// The repo has no test runner, so this transpiles the one (dependency-free)
// module and exercises it directly:
//
//   npx tsc lib/bookings/bay-selection.ts --outDir /tmp/baytest \
//       --module esnext --target es2022 --skipLibCheck
//   node scripts/bay-selection-check.mjs
//
// Wear numbers below are the real 30-day totals as of 2026-09-13, not made up.
// An earlier version of this file used invented figures that happened to be
// close to the inverse of reality, and "proved" a sequence that would never
// occur. If these drift far from production, re-pull them rather than trusting
// a green run:
//
//   select b.number, sum(extract(epoch from (bk.ends_at - bk.starts_at))/60)
//   from bays b join bookings bk on bk.bay_id = b.id
//   where bk.status <> 'cancelled' and bk.starts_at >= now() - interval '30 days'
//   group by b.number order by 2;
import { pickBestBay, buildBayUsage, buildAdjacencyGaps, slotGridGap } from "/tmp/baytest/bay-selection.js"

const BAYS = [
  { id: "b1", number: 1 },
  { id: "b2", number: 2 },
  { id: "b3", number: 3 },
  { id: "b4", number: 4 },
]

// Real booked minutes over the trailing 30 days, 2026-09-13.
const REAL_WEAR_MINUTES = { b3: 1170, b2: 1200, b4: 1305, b1: 1858 }

let pass = 0, fail = 0
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("  PASS  " + name) }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  <- " + detail : "")) }
}

const at = (h, m = 0) => new Date(Date.UTC(2026, 8, 20, h, m))
const iso = (h, m = 0) => at(h, m).toISOString()

// Synthesise booking rows that add up to the real per-bay totals.
function wearRows() {
  return Object.entries(REAL_WEAR_MINUTES).map(([bay, minutes]) => ({
    bay_id: bay,
    starts_at: new Date(Date.UTC(2026, 8, 1)).toISOString(),
    ends_at: new Date(Date.UTC(2026, 8, 1) + minutes * 60000).toISOString(),
  }))
}

console.log("\nReal wear order: bay 3 (19.5h) < bay 2 (20.0h) < bay 4 (21.8h) < bay 1 (31.0h)")

console.log("\nLong runs: never seat two customers side by side, and let wear even out")
{
  // Sessions are laid end to end with `gapHours` of breathing room between
  // them. Nothing overlaps, so no bay is ever concurrently occupied - this is
  // purely about who follows whom.
  function simulate(gapFor, n = 60) {
    const booked = []
    const placed = []
    let cursor = 0
    for (let i = 0; i < n; i++) {
      const start = at(cursor), end = at(cursor + 2)
      const wear = buildBayUsage([...wearRows(), ...booked])
      const gaps = buildAdjacencyGaps(booked, start, end)
      const bay = pickBestBay(BAYS, [], wear, gaps)
      placed.push({ number: bay.number, id: bay.id, start: start.getTime(), end: end.getTime() })
      booked.push({ bay_id: bay.id, starts_at: start.toISOString(), ends_at: end.toISOString() })
      cursor += 2 + gapFor(i)
    }
    const wear = buildBayUsage([...wearRows(), ...booked])
    const mins = BAYS.map((b) => wear.get(b.id).minutes)

    // A bad seating is two customers in ADJACENT bays close enough in time to
    // actually be near one another. Two people in bays 2 and 3 six hours apart
    // never met.
    let sideBySide = 0
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (Math.abs(placed[i].number - placed[j].number) !== 1) continue
        if ((placed[j].start - placed[i].end) / 60000 < 30) sideBySide++
      }
    }
    return { placed, spread: Math.max(...mins) - Math.min(...mins), sideBySide, wear }
  }

  const STARTING_SPREAD = 688 // bay 1 at 1858 minus bay 3 at 1170

  const roomy = simulate(() => 0.5)
  console.log("   30 min between sessions:", roomy.placed.slice(0, 20).map((p) => p.number).join(" "))
  console.log("   sessions each:", BAYS.map((b) =>
    `bay${b.number}=${roomy.placed.filter((p) => p.number === b.number).length}`).join(" "))
  console.log(`   wear spread ${STARTING_SPREAD} -> ${roomy.spread} min`)
  check("nobody is ever seated next to anybody", roomy.sideBySide === 0, `${roomy.sideBySide} bad`)
  // Sessions come out dead even, which is the most rule 3 can do here. It does
  // not claw back bay 1's existing lead: that 688 is historical, from the era
  // when every booking defaulted to bay 1, and an even rotation preserves a
  // gap rather than closing it. Closing it would mean handing bay 1 fewer
  // sessions than the rest, which can only happen by seating someone next to
  // somebody - exactly the trade Jerrod said not to make.
  const counts = BAYS.map((b) => roomy.placed.filter((p) => p.number === b.number).length)
  check("sessions are shared out dead even", Math.max(...counts) - Math.min(...counts) <= 1,
    counts.join(","))
  check("the existing gap does not widen", roomy.spread <= STARTING_SPREAD, `spread ${roomy.spread}`)
  check("every bay is used", new Set(roomy.placed.map((p) => p.number)).size === 4)

  // The pathological case: 60 sessions butted perfectly end to end, one
  // customer at a time, never a minute of slack. Separation still holds, but
  // the row's topology bites - bay 3 is non-adjacent only to bay 1, so once a
  // run settles into 2<->4 it stops being reachable. Real volume is nowhere
  // near this (19-31 booked hours per bay per MONTH), and the moment any gap
  // appears the roomy case above takes over. Asserted so the tradeoff is
  // recorded rather than discovered again later.
  const relentless = simulate(() => 0)
  console.log("   back-to-back all day:", relentless.placed.slice(0, 20).map((p) => p.number).join(" "))
  console.log(`   wear spread ${STARTING_SPREAD} -> ${relentless.spread} min`)
  check("separation still never breaks, even at full tilt", relentless.sideBySide === 0,
    `${relentless.sideBySide} bad`)
  check("known tradeoff: perfectly gapless days do not even out wear",
    relentless.spread > STARTING_SPREAD, `spread ${relentless.spread}`)
}

console.log("\nFour bookings in a row on an otherwise empty evening")
{
  const booked = []
  const chosen = []
  for (let n = 0; n < 4; n++) {
    const start = at(17 + n * 2), end = at(19 + n * 2)
    const wear = buildBayUsage([...wearRows(), ...booked])
    const gaps = buildAdjacencyGaps(booked, start, end)
    const bay = pickBestBay(BAYS, [], wear, gaps)
    chosen.push(bay.number)
    booked.push({ bay_id: bay.id, starts_at: start.toISOString(), ends_at: end.toISOString() })
  }
  console.log("   17:00 -> 19:00 -> 21:00 -> 23:00 lands on bays:", chosen.join(" -> "))
  check("first booking goes to the least-worn bay (3)", chosen[0] === 3, `got ${chosen[0]}`)
  check("second moves to bay 1, a clear bay away from bay 3", chosen[1] === 1, `got ${chosen[1]}`)
  check("never adjacent to the previous session", (() => {
    for (let i = 1; i < chosen.length; i++) if (Math.abs(chosen[i] - chosen[i - 1]) < 2) return false
    return true
  })(), chosen.join(" "))
  check("no two consecutive bookings share a bay",
    chosen[0] !== chosen[1] && chosen[1] !== chosen[2] && chosen[2] !== chosen[3], chosen.join(","))
  check("no back-to-back handoff anywhere in the run", (() => {
    const byBay = new Map()
    for (const b of booked) {
      const prev = byBay.get(b.bay_id) ?? []
      prev.push(new Date(b.starts_at).getTime())
      byBay.set(b.bay_id, prev)
    }
    for (const times of byBay.values()) {
      times.sort((x, y) => x - y)
      for (let i = 1; i < times.length; i++) {
        if ((times[i] - times[i - 1]) / 60000 <= 120) return false
      }
    }
    return true
  })(), chosen.join(","))
}

console.log("\nThe reported case: someone just finished in bay 3")
{
  const existing = [{ bay_id: "b3", starts_at: iso(17), ends_at: iso(19) }]
  const wear = buildBayUsage([...wearRows(), ...existing])
  const gaps = buildAdjacencyGaps(existing, at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 300; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks:", counts)
  check("never stacks onto bay 3", counts.b3 === 0, `bay 3 got ${counts.b3}/300`)
  check("picks bay 1, furthest from the bay they just left", counts.b1 === 300,
    `b1=${counts.b1} b2=${counts.b2} b4=${counts.b4}`)
}

console.log("\nBusy night: all four occupied 17:00-19:00, someone books 19:00")
{
  const existing = BAYS.map((b) => ({ bay_id: b.id, starts_at: iso(17), ends_at: iso(19) }))
  const wear = buildBayUsage([...wearRows(), ...existing])
  const gaps = buildAdjacencyGaps(existing, at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks:", counts)
  check("back-to-back is unavoidable, so least-worn bay 3 wins again", counts.b3 === 200,
    `b3=${counts.b3}/200`)
}

console.log("\nQuiet day, nothing near the window at all")
{
  const wear = buildBayUsage(wearRows())
  const gaps = buildAdjacencyGaps([], at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks:", counts)
  check("pure utilisation call, least-worn bay 3 every time", counts.b3 === 200)
}

console.log("\nConcurrent occupancy still spaces (rule 2 unchanged)")
{
  const gaps = buildAdjacencyGaps([], at(19), at(21))
  const free = BAYS.filter((b) => b.number !== 1)
  const counts = { b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(free, [1], new Map(), gaps).id]++
  console.log("   picks with bay 1 occupied during the window:", counts)
  // Bay 2 is adjacent and never acceptable. Bays 3 and 4 are both a clear bay
  // away, so they are equally good for the customer and the cap makes them
  // tie - bay 4 no longer wins just for being further. With no wear passed in
  // the tie breaks randomly, which is the point: it leaves the decision to
  // rule 3 in real use.
  check("the adjacent bay is never chosen", counts.b2 === 0, `bay 2 got ${counts.b2}`)
  check("both far-enough bays stay in play", counts.b3 > 0 && counts.b4 > 0,
    `b3=${counts.b3} b4=${counts.b4}`)
}

console.log("\nAn hour of clear air is not a turnover problem")
{
  const existing = [{ bay_id: "b3", starts_at: iso(16), ends_at: iso(18) }]
  const wear = buildBayUsage([...wearRows(), ...existing])
  const gaps = buildAdjacencyGaps(existing, at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks (bay 3 empty since 18:00, request 19:00):", counts)
  // Bay 3 is NOT penalised here: a 60 minute gap is comfortably clear, so this
  // is a pure wear call. Bay 3 just loses it, because that 16:00-18:00 session
  // added 120 minutes and pushed it from 1170 to 1290, above bay 2 at 1200.
  // Bays 3 and 2 sit only 30 minutes apart in reality, so a single booking
  // flips the order. That is rule 3 doing exactly its job.
  const w = buildBayUsage([...wearRows(), { bay_id: "b3", starts_at: iso(16), ends_at: iso(18) }])
  console.log(`   wear after that session: b2=${w.get("b2").minutes} b3=${w.get("b3").minutes}`)
  check("a 60 min gap is not treated as a turnover problem", counts.b3 + counts.b2 === 200)
  check("least-worn bay wins on merit, which is now bay 2", counts.b2 === 200,
    `b2=${counts.b2} b3=${counts.b3}`)
}

console.log("\nslotGridGap, the browser-side approximation")
{
  const s = (a) => a.map((available) => ({ available }))
  check("running off both ends of the day is unbounded",
    slotGridGap(s([true, true, true, true]), 1, 2) === Infinity)
  check("taken slot immediately before gives 0",
    slotGridGap(s([false, true, true, true]), 1, 2) === 0)
  check("one free slot before a taken one gives 30",
    slotGridGap(s([false, true, true, true, true]), 2, 2) === 30)
  check("takes the smaller of before and after",
    slotGridGap(s([false, true, true, true, true, false]), 2, 2) === 30)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
