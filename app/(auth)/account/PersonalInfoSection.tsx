"use client"

import { useState } from "react"
import { updateProfile, updateEmail } from "./actions"

export default function PersonalInfoSection({
  firstName,
  lastName,
  phone,
  email,
  smsConsent,
}: {
  firstName: string
  lastName: string
  phone: string | null
  email: string
  smsConsent: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editFirstName, setEditFirstName] = useState(firstName)
  const [editLastName, setEditLastName] = useState(lastName)
  const [editPhone, setEditPhone] = useState(phone ?? "")
  const [editSmsConsent, setEditSmsConsent] = useState(smsConsent)
  const [editEmail, setEditEmail] = useState(email)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  async function handleSave() {
    if (!editFirstName.trim() || !editLastName.trim()) {
      setError("First and last name are required")
      return
    }
    setSaving(true)
    setError(null)

    const result = await updateProfile({
      firstName: editFirstName,
      lastName: editLastName,
      phone: editPhone,
      smsConsent: editSmsConsent,
    })

    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }

    if (editEmail.trim() && editEmail.trim() !== email) {
      const emailResult = await updateEmail(editEmail)
      if (emailResult.error) {
        setError(emailResult.error)
        setSaving(false)
        return
      }
      setEmailSent(true)
    }

    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setEditFirstName(firstName)
    setEditLastName(lastName)
    setEditPhone(phone ?? "")
    setEditSmsConsent(smsConsent)
    setEditEmail(email)
    setError(null)
    setEditing(false)
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">Personal information</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-ghost px-3 py-1.5 text-xs">
            Edit
          </button>
        )}
      </div>

      {emailSent && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-neutral-300">
          Confirmation email sent to <span className="text-white font-medium">{editEmail}</span>. Check your inbox to complete the email change.
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 space-y-4">
        {editing ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="firstName">First name</label>
                <input id="firstName" type="text" value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  className="input mt-1" />
              </div>
              <div>
                <label className="label" htmlFor="lastName">Last name</label>
                <input id="lastName" type="text" value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  className="input mt-1" />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="phone">Phone number</label>
              <input id="phone" type="tel" value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="(574) 555-0100"
                className="input mt-1" />
              <p className="mt-1 text-xs text-neutral-500">Used for booking SMS notifications.</p>
            </div>

            {editPhone.trim() && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={editSmsConsent}
                  onClick={() => setEditSmsConsent(!editSmsConsent)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${editSmsConsent ? "bg-brand" : "bg-white/20"}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${editSmsConsent ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <span className="text-sm text-neutral-300">Receive SMS booking confirmations and access codes</span>
              </div>
            )}

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input id="email" type="email" value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="input mt-1" />
              <p className="mt-1 text-xs text-neutral-500">Changing your email will send a confirmation to the new address.</p>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2 text-sm">
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button onClick={handleCancel} disabled={saving} className="btn-ghost px-5 py-2 text-sm">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-400">Name</span>
              <span className="text-white">{firstName} {lastName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Email</span>
              <span className="text-white">{email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Phone</span>
              <span className="text-white">{phone ?? <span className="text-neutral-500">Not set</span>}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">SMS notifications</span>
              <span className={smsConsent ? "text-green-400" : "text-neutral-500"}>
                {smsConsent ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
