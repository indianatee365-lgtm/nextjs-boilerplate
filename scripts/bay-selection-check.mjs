// Behaviour checks for lib/bookings/bay-selection.ts.
//
// The repo has no test runner, so this transpiles the one (dependency-free)
// module and exercises it directly:
//
//   npx tsc lib/bookings/bay-selection.ts --outDir /tmp/baytest \n//       --module esnext --target es2022 --skipLibCheck
//   node scripts/bay-selection-check.mjs
//
// Written after 2026-09-13, when three bookings stacked back to back on bay 3
// while three other bays sat dark.
import { pickBestBay, buildBayUsage, buildAdjacencyGaps, slotGridGap } from "/tmp/baytest/bay-selection.js"

const BAYS = [
  { id: "b1", number: 1 },
  { id: "b2", number: 2 },
  { id: "b3", number: 3 },
  { id: "b4", number: 4 },
]

let pass = 0, fail = 0
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("  PASS  " + name) }
  else { fail++; console.log("  FAIL  " + name + (detail ? "  <- " + detail : "")) }
}

const iso = (h, m = 0) => new Date(Date.UTC(2026, 8, 20, h, m)).toISOString()
const at = (h, m = 0) => new Date(Date.UTC(2026, 8, 20, h, m))

// Bay 3 is far behind on wear, exactly the condition that caused the stacking.
const WEAR = buildBayUsage([
  { bay_id: "b1", starts_at: iso(1), ends_at: iso(9) },
  { bay_id: "b2", starts_at: iso(1), ends_at: iso(8) },
  { bay_id: "b4", starts_at: iso(1), ends_at: iso(7) },
  { bay_id: "b3", starts_at: iso(1), ends_at: iso(2) },
])

console.log("\nJerrod's scenario: empty place, bay 3 behind on wear, booking already 17:00-19:00 on bay 3")
{
  const existing = [{ bay_id: "b3", starts_at: iso(17), ends_at: iso(19) }]
  const wear = buildBayUsage([...WEAR_ROWS(), ...existing])
  const gaps = buildAdjacencyGaps(existing, at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 400; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks:", counts)
  check("never stacks back-to-back on bay 3 when other bays are clear", counts.b3 === 0,
    `bay 3 chosen ${counts.b3}/400`)
  // Among the bays with clear air, rule 3 still decides, so this is not random:
  // bay 4 is the least-worked of b1/b2/b4 and wins every time.
  check("least-worked of the remaining clear bays wins", counts.b4 === 400,
    `b1=${counts.b1} b2=${counts.b2} b4=${counts.b4}`)
}

function WEAR_ROWS() {
  return [
    { bay_id: "b1", starts_at: iso(1), ends_at: iso(9) },
    { bay_id: "b2", starts_at: iso(1), ends_at: iso(8) },
    { bay_id: "b4", starts_at: iso(1), ends_at: iso(7) },
    { bay_id: "b3", starts_at: iso(1), ends_at: iso(2) },
  ]
}

console.log("\nThree consecutive bookings never land on the same bay")
{
  let booked = []
  const chosen = []
  for (let n = 0; n < 3; n++) {
    const start = at(17 + n * 2), end = at(19 + n * 2)
    const wear = buildBayUsage([...WEAR_ROWS(), ...booked])
    const gaps = buildAdjacencyGaps(booked, start, end)
    const bay = pickBestBay(BAYS, [], wear, gaps)
    chosen.push(bay.number)
    booked.push({ bay_id: bay.id, starts_at: start.toISOString(), ends_at: end.toISOString() })
  }
  console.log("   bays chosen in order:", chosen.join(" -> "))
  check("no two consecutive bookings share a bay",
    chosen[0] !== chosen[1] && chosen[1] !== chosen[2], chosen.join(","))
}

console.log("\nBusy night: every bay is cramped, so wear decides again (rule 3 still works)")
{
  const existing = [
    { bay_id: "b1", starts_at: iso(17), ends_at: iso(19) },
    { bay_id: "b2", starts_at: iso(17), ends_at: iso(19) },
    { bay_id: "b3", starts_at: iso(17), ends_at: iso(19) },
    { bay_id: "b4", starts_at: iso(17), ends_at: iso(19) },
  ]
  const wear = buildBayUsage([...WEAR_ROWS(), ...existing])
  const gaps = buildAdjacencyGaps(existing, at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks:", counts)
  check("least-worked bay 3 wins when back-to-back is unavoidable", counts.b3 === 200,
    `bay 3 chosen ${counts.b3}/200`)
}

console.log("\nRule 1 and 2 still hold")
{
  const gaps = buildAdjacencyGaps([], at(19), at(21))
  const free = BAYS.filter((b) => b.number !== 1)
  const counts = { b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(free, [1], new Map(), gaps).id]++
  console.log("   picks with bay 1 occupied at the same time:", counts)
  check("furthest bay from the occupied one wins", counts.b4 === 200)
}

console.log("\nAn hour of clear air is not a turnover problem")
{
  const existing = [{ bay_id: "b3", starts_at: iso(16), ends_at: iso(18) }]
  const wear = buildBayUsage([...WEAR_ROWS(), ...existing])
  const gaps = buildAdjacencyGaps(existing, at(19), at(21))
  const counts = { b1: 0, b2: 0, b3: 0, b4: 0 }
  for (let i = 0; i < 200; i++) counts[pickBestBay(BAYS, [], wear, gaps).id]++
  console.log("   picks (bay 3 free since 18:00, request 19:00):", counts)
  check("a 60 min gap does not penalise the least-worked bay", counts.b3 === 200)
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
