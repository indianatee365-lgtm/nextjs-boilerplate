export default function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-neutral-400 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Tee365</p>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="hover:text-white" href="/#info">
            Details
          </a>
          <a className="hover:text-white" href="/#waitlist">
            Get Early Access
          </a>
          <a className="hover:text-white" href="/#waitlist">
            Gift cards
          </a>
          <a className="hover:text-white" href="/faq">
            FAQ
          </a>
        </div>
      </div>
    </footer>
  );
}

