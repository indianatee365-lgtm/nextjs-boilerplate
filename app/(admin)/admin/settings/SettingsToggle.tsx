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
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
      <button
        onClick={toggle}
        disabled={isPending}
        aria-pressed={value}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          value ? "bg-brand" : "bg-white/15"
        } ${isPending ? "opacity-60" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            value ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}
