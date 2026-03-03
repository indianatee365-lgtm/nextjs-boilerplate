export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Tee365"
            className="h-9 w-9 rounded-full border border-white/10 bg-black/30 p-1"
          />
          <span className="text-sm font-semibold text-white"></span>
        </a>

        <nav className="hidden items-center gap-6 text-sm text-neutral-300 md:flex">
          <a className="hover:text-white" href="#info">
            Details
          </a>
       
          <a className="hover:text-white" href="#gift">
            Gift cards
          </a>
          <a className="hover:text-white" href="/faq">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#waitlist"
            className="hidden rounded-xl border border-[color:var(--brandLine)] bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 md:inline-flex"
          >
            Email List
          </a>

          <a
            href="#info"
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-black transition hover:brightness-95"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Details
          </a>
        </div>
      </div>
    </header>
  );
}

