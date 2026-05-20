import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import IssueGiftCardForm from "./IssueGiftCardForm"
import DeactivateButton from "./DeactivateButton"

export const metadata = { title: "Gift Cards | Tee365 Admin" }

export default async function AdminGiftCardsPage() {
  const supabase = await createClient()
  const serviceClient = await createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/account")

  const { data: cards } = await serviceClient
    .from("gift_cards")
    .select("id, code, original_amount, balance, active, expires_at, created_at, recipient_name, recipient_email, purchased_by")
    .order("created_at", { ascending: false })

  const activeCards = (cards ?? []).filter((c) => c.active)
  const totalIssued = activeCards.reduce((sum, c) => sum + Number(c.original_amount), 0)
  const totalRedeemed = activeCards.reduce((sum, c) => sum + (Number(c.original_amount) - Number(c.balance)), 0)
  const totalOutstanding = activeCards.reduce((sum, c) => sum + Number(c.balance), 0)

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-white">Gift Cards</h1>
        <IssueGiftCardForm />
      </div>

      {/* Liability summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs text-neutral-500">Active cards issued</p>
          <p className="mt-1 text-2xl font-bold text-white">{activeCards.length}</p>
          <p className="text-xs text-neutral-500 mt-0.5">${totalIssued.toFixed(2)} face value</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-xs text-neutral-500">Redeemed</p>
          <p className="mt-1 text-2xl font-bold text-white">${totalRedeemed.toFixed(2)}</p>
          <p className="text-xs text-neutral-500 mt-0.5">of ${totalIssued.toFixed(2)} issued</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-4">
          <p className="text-xs text-neutral-500">Outstanding liability</p>
          <p className="mt-1 text-2xl font-bold text-red-400">${totalOutstanding.toFixed(2)}</p>
          <p className="text-xs text-neutral-500 mt-0.5">unredeemed balance</p>
        </div>
      </div>

      {cards && cards.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-b border-white/5 text-neutral-300">
                  <td className="px-4 py-3 font-mono font-medium text-xs">{c.code}</td>
                  <td className="px-4 py-3">
                    <p className="text-white">{c.recipient_name ?? "—"}</p>
                    {c.recipient_email && <p className="text-xs text-neutral-500">{c.recipient_email}</p>}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{c.purchased_by ?? "—"}</td>
                  <td className="px-4 py-3">${Number(c.original_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 font-semibold text-white">${Number(c.balance).toFixed(2)}</td>
                  <td className="px-4 py-3 text-neutral-400">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.active && <DeactivateButton id={c.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No gift cards yet.</p>
      )}
    </main>
  )
}
