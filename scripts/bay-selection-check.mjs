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
  check("second moves to bay 1, the furthest bay from bay 3", chosen[1] === 1, `got ${chosen[1]}`)
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
  check("furthest bay from the occupied one wins", counts.b4 === 200)
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
