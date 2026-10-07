"use client"

import { useState, useTransition } from "react"
import { setAdminSetting, setPlanOnSale } from "./actions"

export default function SettingsToggle({
  settingKey,
  label,
  description,
  initialValue,
  planSlug,
}: {
  settingKey: string
  label: string
  description: string
  initialValue: boolean
  // When set, the switch puts this membership plan on or off sale instead of
  // writing an admin_settings key.
  planSlug?: string
}) {
  const [value, setValue] = useState(initialValue)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !value
    setValue(next)
    startTransition(async () => {
      if (planSlug) await setPlanOnSale(planSlug, next)
      else await setAdminSetting(settingKey, next)
    })
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
      {/* The knob is pinned to the left edge (left-0) and slid by translate.
          Without left-0 it started from the button's centered content, so it
          sat on the right when off and hung past the track when on. */}
      <div className="flex shrink-0 items-center gap-2">
        <span className={`w-7 text-right text-xs font-semibold ${value ? "text-brand" : "text-neutral-500"}`}>
          {value ? "On" : "Off"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          onClick={toggle}
          disabled={isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            value ? "bg-brand" : "bg-white/15"
          } ${isPending ? "opacity-60" : ""}`}
        >
          <span
            className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              value ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  )
}
