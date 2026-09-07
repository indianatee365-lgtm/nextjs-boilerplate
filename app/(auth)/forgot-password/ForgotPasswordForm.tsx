"use client"

import { useActionState, useState } from "react"
import { requestPasswordReset, resetPasswordWithCode } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"

const initialState: SignupState = {}

// Two steps in one component (not two pages) so the email address only has
// to be typed once and gets carried straight into the code+password step -
// see resetPasswordWithCode's own comment for why this replaced the old
// single clickable link.
const SUCCESS_MESSAGE = "Check your email for a password reset code."

export default function ForgotPasswordForm() {
  const [requestState, requestAction, requestPending] = useActionState(requestPasswordReset, initialState)
  const [resetState, resetAction, resetPending] = useActionState(resetPasswordWithCode, initialState)
  const [enteredEmail, setEnteredEmail] = useState<string | null>(null)

  // Only advance to step 2 once the send actually succeeded - not the
  // moment the form submits, or a failed send (bad email, rate limit)
  // would silently show a code-entry screen with no code ever sent.
  const submittedEmail = requestState.message === SUCCESS_MESSAGE ? enteredEmail : null

  if (submittedEmail) {
    return (
      <form action={resetAction} className="space-y-5">
        <input type="hidden" name="email" value={submittedEmail} />
        <p className="text-sm text-neutral-400">
          Enter the 6-digit code we sent to <span className="text-white">{submittedEmail}</span> and choose a new password.
        </p>

        {resetState.message && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {resetState.message}
          </div>
        )}

        <div>
          <label className="label" htmlFor="code">6-digit code</label>
          <input
            id="code" name="code" type="text" inputMode="numeric" pattern="[0-9]{6}"
            maxLength={6} required autoComplete="one-time-code" className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" required minLength={8} className="input" />
        </div>

        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" required minLength={8} className="input" />
        </div>

        <button type="submit" disabled={resetPending} className="btn-primary w-full">
          {resetPending ? "Updating…" : "Set new password"}
        </button>

        <button
          type="button"
          onClick={() => setEnteredEmail(null)}
          className="w-full text-center text-sm text-neutral-500 hover:text-neutral-300"
        >
          Use a different email
        </button>
      </form>
    )
  }

  return (
    <form
      action={(formData) => {
        setEnteredEmail((formData.get("email") as string)?.trim() || null)
        requestAction(formData)
      }}
      className="space-y-5"
    >
      {requestState.message && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {requestState.message}
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>

      <button type="submit" disabled={requestPending} className="btn-primary w-full">
        {requestPending ? "Sending…" : "Send reset code"}
      </button>
    </form>
  )
}
