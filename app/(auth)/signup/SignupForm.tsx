"use client"

import { useActionState } from "react"
import { signup } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"

const initialState: SignupState = {}

export default function SignupForm({ returnUrl }: { returnUrl?: string }) {
  const [state, formAction, pending] = useActionState(signup, initialState)

  return (
    <form action={formAction} className="space-y-5">
      {returnUrl && <input type="hidden" name="returnUrl" value={returnUrl} />}
      {state.message && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" type="text" required className="input" />
          {state.errors?.firstName && <p className="field-error">{state.errors.firstName[0]}</p>}
        </div>
        <div>
          <label className="label" htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" type="text" required className="input" />
          {state.errors?.lastName && <p className="field-error">{state.errors.lastName[0]}</p>}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" type="tel" required className="input" placeholder="+1 (555) 000-0000" />
        {state.errors?.phone && <p className="field-error">{state.errors.phone[0]}</p>}
        <p className="mt-1.5 text-xs text-neutral-500">
          By providing your number, you agree to receive SMS booking confirmations and access codes from Tee365. Msg &amp; data rates may apply. Reply STOP to opt out.{" "}
          <a href="/privacy" className="underline hover:text-neutral-300">Privacy Policy</a>
        </p>
      </div>

      <div>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required className="input" />
        {state.errors?.email && <p className="field-error">{state.errors.email[0]}</p>}
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" />
        {state.errors?.password && <p className="field-error">{state.errors.password[0]}</p>}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  )
}
