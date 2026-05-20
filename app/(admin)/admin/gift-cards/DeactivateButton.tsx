"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { deactivateGiftCard } from "./actions"

export default function DeactivateButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDeactivate() {
    setLoading(true)
    const result = await deactivateGiftCard(id)
    if (result.error) {
      alert(result.error)
      setLoading(false)
      return
    }
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDeactivate}
          disabled={loading}
          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
        >
          {loading ? "..." : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
    >
      Deactivate
    </button>
  )
}
