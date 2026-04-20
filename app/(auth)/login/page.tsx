"use client"

import { useActionState } from "react"
import { login } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"

const initialState: SignupState = {}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-brand hover:underline">
            Create one
          </a>
        </p>
      </div>

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

        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  )
}
