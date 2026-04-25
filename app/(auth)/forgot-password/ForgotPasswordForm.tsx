"use client"

import { useActionState } from "react"
import { requestPasswordReset } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"

const initialState: SignupState = {}

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState)

  if (state.message === "Check your email for a password reset link.") {
    return (
      <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-400">
        {state.message}
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.message && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  )
}
