import Link from "next/link"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export default async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let firstName: string | null = null
  if (user) {
    const sc = await createServiceClient()
    const { data: profile } = await sc.from("profiles").select("first_name").eq("id", user.id).single()
    firstName = (profile as { first_name: string } | null)?.first_name ?? null
  }
  const initial = firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070c]/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 transition hover:bg-white/10"
        >
          <span className="text-sm font-semibold tracking-wide text-white">Tee365</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link href="/about" className="hidden sm:inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">About</Link>
          <Link href="/gift-cards" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">Gift Cards</Link>
          <Link href="/founders" className="inline-flex items-center rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold tracking-wide text-black transition hover:brightness-95" style={{ backgroundColor: "var(--brand)" }}>Founder&apos;s</Link>
          {user ? (
            <Link
              href="/account"
              className="ml-1 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 pl-1 pr-3 py-1 transition hover:bg-white/10"
              aria-label={firstName ? `Account (${firstName})` : "Account"}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-black"
                style={{ backgroundColor: "var(--brand)" }}
              >{initial}</span>
              {firstName && <span className="hidden sm:inline text-sm font-medium text-white">{firstName}</span>}
            </Link>
          ) : (
            <Link href="/login" className="ml-1 inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  )
}
