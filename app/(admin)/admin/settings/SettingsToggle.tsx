"use client"

import { useState, useTransition } from "react"
import { setAdminSetting } from "./actions"

export default function SettingsToggle({
  settingKey,
  label,
  description,
  initialValue,
}: {
  settingKey: string
  label: string
  description: string
  initialValue: boolean
}) {
  const [value, setValue] = useState(initialValue)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !value
    setValue(next)
    startTransition(async () => {
      await setAdminSetting(settingKey, next)
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
