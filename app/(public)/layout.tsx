import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { logout } from "@/app/actions/auth"

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold text-white">Tee365</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/book" className="text-neutral-300 hover:text-white transition">Book</Link>
            {user ? (
              <>
                <Link href="/account" className="text-neutral-300 hover:text-white transition">Account</Link>
                <form action={logout}>
                  <button className="text-neutral-500 hover:text-white transition">Sign out</button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="text-neutral-300 hover:text-white transition">Sign in</Link>
                <Link href="/signup" className="btn-primary px-4 py-2 text-xs">Create account</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-neutral-600">
        © {new Date().getFullYear()} Tee365 · <a href="mailto:info@tee365.org" className="hover:text-neutral-400">info@tee365.org</a>
      </footer>
    </>
  )
}
