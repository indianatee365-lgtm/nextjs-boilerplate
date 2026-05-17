import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { logout } from "@/app/actions/auth"

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070c]/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 transition hover:bg-white/10"
          >
            <span className="text-sm font-semibold tracking-wide text-white">Tee365</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/book" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">Book</Link>
            {user ? (
              <>
                <Link href="/account" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">Account</Link>
                <form action={logout}>
                  <button className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-neutral-400 transition hover:bg-white/10 hover:text-white">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">Sign in</Link>
                <Link href="/signup" className="btn-primary px-3 py-1.5 text-sm">Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="relative flex-1 overflow-hidden">
        <div
          className="pointer-events-none absolute top-[-220px] left-[-160px] h-[620px] w-[620px] rounded-full blur-3xl opacity-45"
          style={{ backgroundColor: "var(--brandGlow)" }}
        />
        <div
          className="pointer-events-none absolute top-[100px] right-[-160px] h-[520px] w-[520px] rounded-full blur-3xl opacity-25"
          style={{ backgroundColor: "var(--brandSoft)" }}
        />
        {children}
      </div>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-neutral-600">
        © {new Date().getFullYear()} Tee365 · <a href="mailto:info@tee365.org" className="hover:text-neutral-400">info@tee365.org</a>
      </footer>
    </>
  )
}
