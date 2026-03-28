import Link from "next/link"

const EMAIL_LIST_URL = "/#waitlist"

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Tee365 Indoor golf simulator logo"
            className="h-9 w-9 rounded-full border border-white/10 bg-black/30 p-1"
          />
          <span className="text-sm font-semibold text-white"></span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-neutral-300 md:flex">
          <Link className="hover:text-white" href="/indoor-golf-simulator-mishawaka">
            Indoor Golf
          </Link>

          <Link className="hover:text-white" href="/#info">
            Details
          </Link>

          <Link className="hover:text-white" href="/#gift">
            Gift cards
          </Link>

          <Link className="hover:text-white" href="/faq">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={EMAIL_LIST_URL}
            className="hidden rounded-xl border border-[color:var(--brandLine)] bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 md:inline-flex"
          >
            Get Early Access
          </a>

          <Link
            href="/#info"
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Details
          </Link>
        </div>
      </div>
    </header>
  )

}

