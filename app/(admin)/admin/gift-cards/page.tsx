import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import IssueGiftCardForm from "./IssueGiftCardForm"

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-white">Gift Cards</h1>
        <IssueGiftCardForm />
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
