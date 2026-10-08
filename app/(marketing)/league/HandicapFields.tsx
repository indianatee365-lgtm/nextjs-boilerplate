"use client"

/**
 * Starting handicap and tee choice, asked of every league player at signup.
 * The 9-hole starting handicap is worked out server-side
 * (lib/league/handicap.ts), so this only collects what the player knows.
 */
export interface HandicapAnswer {
  basis: "index" | "typical_score"
  value: string
  forwardTees: boolean
}

export function handicapAnswerValid(a: HandicapAnswer): boolean {
  const n = Number(a.value)
  if (a.value.trim() === "" || !Number.isFinite(n)) return false
  return a.basis === "index" ? n >= -5 && n <= 54 : n >= 55 && n <= 160
}

export default function HandicapFields({ value, onChange }: { value: HandicapAnswer; onChange: (v: HandicapAnswer) => void }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
      <legend className="px-1 text-sm font-semibold text-white">Your starting handicap</legend>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["index", "I have a handicap"],
          ["typical_score", "I don't have one"],
        ] as const).map(([basis, label]) => (
          <label key={basis}
            className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-2 text-center text-sm transition ${
              value.basis === basis ? "border-brand bg-brand/10 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"}`}>
            <input type="radio" name="handicap-basis" className="sr-only" checked={value.basis === basis}
              onChange={() => onChange({ ...value, basis, value: "" })} />
            {label}
          </label>
        ))}
      </div>
      <div>
        <label htmlFor="handicap-value" className="label">
          {value.basis === "index" ? "Your 18-hole handicap" : "Your typical 18-hole score"}
        </label>
        <input id="handicap-value" inputMode="decimal" className="input" value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          placeholder={value.basis === "index" ? "e.g. 14.2" : "e.g. 92"} />
        <p className="mt-1 text-xs text-neutral-500">
          Be honest. From week 3 your handicap comes from your league scores, and the commissioner can adjust it.
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-300">
        <input type="checkbox" checked={value.forwardTees} onChange={(e) => onChange({ ...value, forwardTees: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-brand" />
        I&apos;ll play the forward tees all season (seniors and anyone who wants a shorter course).
      </label>
    </fieldset>
  )
}
