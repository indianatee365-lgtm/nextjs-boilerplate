"use client"

import { useState, useActionState } from "react"
import { createCoupon } from "./actions"
import { X, Plus } from "lucide-react"

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export default function CreateCouponModal() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [discountType, setDiscountType] = useState("percent")
  const [state, action, pending] = useActionState(async (_: unknown, formData: FormData) => {
    try {
      await createCoupon(formData)
      setOpen(false)
      setCode("")
      return null
    } catch (e) {
      return (e as Error).message
    }
  }, null)

  return (
    <>
      <button onClick={() => { setOpen(true); setCode(randomCode()) }} className="flex items-center gap-1.5 btn-primary px-4 py-2 text-sm">
        <Plus size={14} /> Issue coupon
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Issue coupon</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-500 hover:text-white"><X size={18} /></button>
            </div>

            <form action={action} className="space-y-4">
              <div>
                <label className="label">Name <span className="text-neutral-500 font-normal">(internal label)</span></label>
                <input name="name" type="text" placeholder="e.g. Bowler&apos;s Country Club Partnership" className="input mt-1 w-full" />
              </div>

              <div>
                <label className="label">Code</label>
                <div className="flex gap-2 mt-1">
                  <input name="code" type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required className="input flex-1 font-mono" />
                  <button type="button" onClick={() => setCode(randomCode())} className="btn-ghost px-3 py-2 text-xs">Randomize</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select name="discount_type" value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="input mt-1 w-full">
                    <option value="percent">Percent off</option>
                    <option value="fixed">Flat $ off</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">{discountType === "percent" ? "%" : "$"}</span>
                    <input name="discount_value" type="number" min="0" max={discountType === "percent" ? "100" : undefined} step="0.01" required className="input w-full pl-7" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Max total uses <span className="text-neutral-500 font-normal">(blank = unlimited)</span></label>
                  <input name="max_uses" type="number" min="1" className="input mt-1 w-full" />
                </div>
                <div>
                  <label className="label">Max per customer <span className="text-neutral-500 font-normal">(blank = unlimited)</span></label>
                  <input name="max_uses_per_user" type="number" min="1" className="input mt-1 w-full" />
                </div>
              </div>

              <div>
                <label className="label">Expires <span className="text-neutral-500 font-normal">(blank = never)</span></label>
                <input name="expires_at" type="date" className="input mt-1 w-full" />
              </div>

              {state && <p className="text-sm text-red-400">{state}</p>}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={pending} className="btn-primary flex-1 py-2 text-sm">
                  {pending ? "Creating…" : "Create coupon"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
