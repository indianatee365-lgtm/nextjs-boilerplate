"use client"

import { useState } from "react"
import CustomerSearch from "@/app/(admin)/admin/events/CustomerSearch"

/**
 * "Who is this for?" on the admin grant forms. Search by name, phone or email
 * and picking someone fills in their account email, instead of opening their
 * user page to copy it. The email box stays editable and is still what the
 * form submits, so typing an address straight in works exactly as before.
 */
export default function CustomerEmailField({ id, name = "email" }: { id: string; name?: string }) {
  const [email, setEmail] = useState("")
  const [picked, setPicked] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <CustomerSearch
        label="Find the customer (name, phone or email)"
        emptyText="No match. Check the spelling, or type their email below."
        onPick={(c) => {
          setEmail(c.email ?? "")
          setPicked(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null)
        }}
      />
      <div>
        <label className="label" htmlFor={id}>Customer email</label>
        <input
          id={id} name={name} type="email" required
          value={email}
          onChange={(e) => { setEmail(e.target.value); setPicked(null) }}
          placeholder="customer@example.com" className="input mt-1 w-full"
        />
        {picked && !email && (
          <p className="mt-1 text-xs text-red-400">{picked} has no email on their account, so this can&apos;t be granted by email.</p>
        )}
      </div>
    </div>
  )
}
