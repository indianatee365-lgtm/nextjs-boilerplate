"use client"

import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { grantMembershipByEmail } from "./actions"

export default function GrantMembershipForm({
  plans,
}: {
  plans: { id: string; display_name: string | null; name: string; price_monthly: number }[]
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState<{ ok: boolean; message: string } | null, FormData>(
    async (_prev, formData) => {
      try {
        const result = await grantMembershipByEmail(formData)
        if (result.ok) router.refresh()
        return result
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : "Something went wrong." }
      }
    },
    null
  )

  return (
    <form action={action} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-white">Grant directly to an account</h2>
      <p className="text-xs text-neutral-500">Adds a free membership straight to an existing account, no code needed.</p>
      <div>
        <label className="label" htmlFor="grant-email">Customer email</label>
        <input
          id="grant-email" name="email" type="email" required
          placeholder="customer@example.com" className="input mt-1 w-full"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="grant-plan">Plan</label>
          <select id="grant-plan" name="plan_id" required className="input mt-1 w-full">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name ?? p.name} (${Number(p.price_monthly).toFixed(2)}/mo after)</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="grant-period">Free period</label>
          <select id="grant-period" name="free_period" required className="input mt-1 w-full">
            <option value="month">1 month</option>
            <option value="year">1 year</option>
          </select>
        </div>
      </div>
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Granting…" : "Grant membership"}
      </button>
      {state && (
        <p className={`text-xs ${state.ok ? "text-green-400" : "text-red-400"}`}>{state.message}</p>
      )}
    </form>
  )
}
