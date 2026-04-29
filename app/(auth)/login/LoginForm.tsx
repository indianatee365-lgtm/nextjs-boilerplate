"use client"

import { useActionState, useState } from "react"
import { login } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"
import { Turnstile } from "@/app/components/Turnstile"

const initialState: SignupState = {}

export default function LoginForm({ returnUrl }: { returnUrl?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState)
  const [tsReady, setTsReady] = useState(!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

  return (
    <form action={formAction} className="space-y-5">
      {returnUrl && <input type="hidden" name="returnUrl" value={returnUrl} />}

      {state.message && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

      <div>
        <label className="label" htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" required className="input" />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Password</label>
          <a href="/forgot-password" className="text-xs text-brand hover:underline">Forgot password?</a>
        </div>
        <input id="password" name="password" type="password" required className="input" />
      </div>

      <Turnstile onVerified={setTsReady} />

      <button type="submit" disabled={pending || !tsReady} className="btn-primary w-full">
        {pending ? "Signing in…" : !tsReady ? "Verifying…" : "Sign in"}
      </button>
    </form>
  )
}
