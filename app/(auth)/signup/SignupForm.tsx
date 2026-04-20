"use client"

import { useActionState, useState } from "react"
import { signup } from "@/app/actions/auth"
import type { SignupState } from "@/app/actions/auth"
import { ChevronDown, ChevronUp } from "lucide-react"

interface Disclosure {
  id: string
  title: string
  body: string
}

const initialState: SignupState = {}

export default function SignupForm({ disclosures }: { disclosures: Disclosure[] }) {
  const [state, formAction, pending] = useActionState(signup, initialState)
  const [expanded, setExpanded] = useState<string | null>(disclosures[0]?.id ?? null)
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  const allAcknowledged = disclosures.every((d) => acknowledged.has(d.id))

  function toggleAck(id: string) {
    setAcknowledged((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <form action={formAction} className="space-y-5">
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

      {/* Disclosures */}
      {disclosures.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-white">
            Please read and acknowledge the following:
          </p>
          {disclosures.map((disclosure) => (
            <div
              key={disclosure.id}
              className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() =>
                  setExpanded(expanded === disclosure.id ? null : disclosure.id)
                }
              >
                <span className="text-sm font-medium text-white">{disclosure.title}</span>
                {expanded === disclosure.id ? (
                  <ChevronUp size={16} className="text-neutral-400 shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-neutral-400 shrink-0" />
                )}
              </button>

              {expanded === disclosure.id && (
                <div className="border-t border-white/10 px-4 py-3">
                  <div className="max-h-48 overflow-y-auto text-xs leading-5 text-neutral-300 whitespace-pre-wrap">
                    {disclosure.body}
                  </div>
                </div>
              )}

              <div className="border-t border-white/10 px-4 py-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    name="disclosureId"
                    value={disclosure.id}
                    checked={acknowledged.has(disclosure.id)}
                    onChange={() => toggleAck(disclosure.id)}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 accent-brand"
                  />
                  I have read and agree to the {disclosure.title}
                </label>
              </div>
            </div>
          ))}

          {state.errors?.disclosureIds && (
            <p className="field-error">{state.errors.disclosureIds[0]}</p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !allAcknowledged}
        className="btn-primary w-full"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  )
}
