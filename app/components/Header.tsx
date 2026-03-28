import Link from "next/link"

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070c]/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 transition hover:bg-white/10"
        >
<span className="text-sm font-semibold tracking-wide text-white">Tee365</span>
        </Link>
      </div>
    </header>
  )
}
