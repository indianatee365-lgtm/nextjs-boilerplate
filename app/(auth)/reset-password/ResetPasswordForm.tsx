"use client"

import { useActionState } from "react"
import { updatePassword } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"

const initialState: SignupState = {}

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState)

  return (
    <form action={formAction} className="space-y-5">
      {state.message && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

      <div>
        <label className="label" htmlFor="password">New password</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" />
      </div>

      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" required minLength={8} className="input" />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  )
}
