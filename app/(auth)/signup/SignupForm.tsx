"use client"

import { useActionState, useState } from "react"
import { signup } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"
import { Turnstile } from "@/app/components/Turnstile"

const initialState: SignupState = {}

export default function SignupForm({ returnUrl }: { returnUrl?: string }) {
  const [state, formAction, pending] = useActionState(signup, initialState)
  const [tsReady, setTsReady] = useState(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  const [isMinor, setIsMinor] = useState<boolean | null>(null)
  const [wantsSms, setWantsSms] = useState<boolean | null>(null)

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
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required className="input" />
        {state.errors?.email && <p className="field-error">{state.errors.email[0]}</p>}
      </div>

      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={8} className="input" />
        {state.errors?.password && <p className="field-error">{state.errors.password[0]}</p>}
      </div>

      {/* SMS opt-in */}
      <div>
        <p className="text-sm font-medium text-white">Get your access code by text.</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Your code arrives 15 minutes before you play, plus the occasional exclusive offer.
        </p>
        <div className="flex gap-3 mt-3">
          <button
            type="button"
            onClick={() => setWantsSms(true)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              wantsSms === true
                ? "border-brand bg-brand/10 text-white"
                : "border-white/10 bg-white/5 text-neutral-400 hover:border-white/20"
            }`}
          >
            I&apos;m in
          </button>
          <button
            type="button"
            onClick={() => setWantsSms(false)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              wantsSms === false
                ? "border-white/30 bg-white/5 text-white"
                : "border-white/10 bg-white/5 text-neutral-400 hover:border-white/20"
            }`}
          >
            Email is fine
          </button>
        </div>

        <div className={`transition-all duration-300 overflow-hidden ${wantsSms === true ? "max-h-40 opacity-100 mt-3" : "max-h-0 opacity-0"}`}>
          <input
            id="phone"
            name="phone"
            type="tel"
            required={wantsSms === true}
            className="input w-full"
            placeholder="+1 (555) 000-0000"
          />
          {state.errors?.phone && <p className="field-error">{state.errors.phone[0]}</p>}
          <p className="mt-1.5 text-xs text-neutral-600">
            Msg &amp; data rates may apply. Reply STOP anytime.
          </p>
        </div>

        <input type="hidden" name="smsConsent" value={wantsSms === true ? "on" : "off"} />
      </div>

      <input type="hidden" name="isMinor" value={isMinor === true ? "true" : "false"} />

      <div>
        <label className="label">Are you 18 or older?</label>
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={() => setIsMinor(false)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              isMinor === false
                ? "border-brand bg-brand/10 text-white"
                : "border-white/10 bg-white/5 text-neutral-400 hover:border-white/20"
            }`}
          >
            Yes, I am 18 or older
          </button>
          <button
            type="button"
            onClick={() => setIsMinor(true)}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
              isMinor === true
                ? "border-brand bg-brand/10 text-white"
                : "border-white/10 bg-white/5 text-neutral-400 hover:border-white/20"
            }`}
          >
            No, I am under 18
          </button>
        </div>
        {state.errors?.isMinor && <p className="field-error">{state.errors.isMinor[0]}</p>}
      </div>

      {isMinor === true && (
        <div>
          <label className="label" htmlFor="parentEmail">Parent or guardian email</label>
          <input id="parentEmail" name="parentEmail" type="email" required className="input"
            placeholder="parent@example.com" />
          <p className="mt-1.5 text-xs text-neutral-500">
            We&apos;ll send them a consent form. Your account activates once they sign it.
          </p>
          {state.errors?.parentEmail && <p className="field-error">{state.errors.parentEmail[0]}</p>}
        </div>
      )}

      <Turnstile onVerified={setTsReady} />

      <button
        type="submit"
        disabled={pending || !tsReady || isMinor === null || wantsSms === null}
        className="btn-primary w-full"
      >
        {pending ? "Creating account…" : !tsReady ? "Verifying…" : "Create account"}
      </button>
    </form>
  )
}
