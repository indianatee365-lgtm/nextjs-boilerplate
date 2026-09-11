"use client"

import { useMemo, useRef, useState } from "react"

export type Contact = {
  name: string
  phone: string
  /** Set when they have a session today, e.g. "Bay 2 · 7:00 PM". */
  today?: string
  optedOut?: boolean
}

// The whole point of this is looking someone up mid-crunch without leaving the
// page to copy a number and paste it back. The contact list is small enough
// (a couple hundred) to ship down whole and filter here, so typing stays
// instant instead of waiting on a request per keystroke.
//
// The input is still a plain text field named "phone", exactly what the form
// posted before. Typing a raw number and ignoring the dropdown works the same
// as it always did, and if this component never hydrates the form still sends.

function digitsOf(s: string): string {
  return s.replace(/\D/g, "")
}

function formatPhone(phone: string): string {
  const d = digitsOf(phone)
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d
  if (ten.length !== 10) return phone
  return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`
}

export default function RecipientPicker({ contacts }: { contacts: Contact[] }) {
  const [value, setValue] = useState("")
  const [picked, setPicked] = useState<Contact | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = value.trim().toLowerCase()
  const queryDigits = digitsOf(value)

  const matches = useMemo(() => {
    if (!query) return []
    // Digits get matched against the number, anything else against the name.
    // Someone typing a phone number outright doesn't need a menu in their way,
    // so that only offers a match while the number is still incomplete.
    if (queryDigits.length >= 3 && queryDigits.length === digitsOf(query).length) {
      if (queryDigits.length >= 10) return []
      return contacts.filter(c => digitsOf(c.phone).includes(queryDigits)).slice(0, 8)
    }
    const starts: Contact[] = []
    const contains: Contact[] = []
    for (const c of contacts) {
      const name = c.name.toLowerCase()
      if (name.startsWith(query)) starts.push(c)
      else if (name.includes(query)) contains.push(c)
      // A last name typed on its own should still surface the person.
      else if (name.split(/\s+/).some(part => part.startsWith(query))) contains.push(c)
    }
    return [...starts, ...contains].slice(0, 8)
  }, [contacts, query, queryDigits])

  const showMenu = open && matches.length > 0

  function choose(c: Contact) {
    setPicked(c)
    setValue(formatPhone(c.phone))
    setOpen(false)
    setActive(0)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showMenu) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive(i => (i + 1) % matches.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive(i => (i - 1 + matches.length) % matches.length)
    } else if (e.key === "Enter") {
      // Only swallow Enter while a name is highlighted, so it can't eat a
      // submit when the menu is just sitting there.
      e.preventDefault()
      choose(matches[active])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label className="text-sm text-neutral-400" htmlFor="sms-recipient">
        Send to
      </label>
      <input
        id="sms-recipient"
        ref={inputRef}
        type="text"
        name="phone"
        required
        autoComplete="off"
        value={value}
        placeholder="Start typing a name, or enter a number"
        className="input mt-1 w-full"
        onChange={e => {
          setValue(e.target.value)
          setPicked(null)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        // Blur runs before a click on the menu registers, so this waits long
        // enough for the click to land.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-controls="sms-recipient-matches"
        aria-expanded={showMenu}
      />

      {/* Confirms who got picked, so the number in the box doesn't have to be
          re-read against another tab to trust it. */}
      {picked ? (
        <p className="mt-1.5 text-sm text-neutral-300">
          <span className="text-white">{picked.name}</span>
          {picked.today && <span className="text-neutral-500"> &middot; {picked.today}</span>}
          {picked.optedOut && <span className="text-amber-400"> &middot; opted out of texts</span>}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-neutral-600">
          {contacts.length} contacts. Type a name to search, or paste a number as usual.
        </p>
      )}

      {showMenu && (
        <ul
          id="sms-recipient-matches"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0b0f17] shadow-xl"
          role="listbox"
        >
          {matches.map((c, i) => (
            <li key={c.phone + c.name}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-white">{c.name}</span>
                  {(c.today || c.optedOut) && (
                    <span className="block truncate text-xs">
                      {c.today && <span className="text-[color:var(--brand)]">{c.today}</span>}
                      {c.today && c.optedOut && <span className="text-neutral-600"> &middot; </span>}
                      {c.optedOut && <span className="text-amber-400">opted out</span>}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-400">{formatPhone(c.phone)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
