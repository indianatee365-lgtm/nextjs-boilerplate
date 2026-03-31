import Link from "next/link"

export default function Header() {
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
          <Link href="/about" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">About</Link>
          <Link href="/faq" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">FAQ</Link>
          <Link href="/contact" className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold tracking-wide text-white transition hover:bg-white/10">Contact</Link>
        </nav>
      </div>
    </header>
  )
}
