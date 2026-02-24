import "./globals.css";
import Link from "next/link";

const navLink =
  "text-sm text-neutral-300 hover:text-white transition";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0f19]/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
             <img
  src="/logo.png"
  alt="Tee365"
  className="h-8 w-auto"
/>

              <span className="text-sm font-semibold tracking-tight text-white">
                Tee365
              </span>
            </Link>

            <nav className="flex items-center gap-6">
              <Link href="/faq" className={navLink}>
                FAQ
              </Link>
              <a href="/#waitlist" className={navLink}>
                Waitlist
              </a>
            </nav>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-6 py-12">{children}</div>

        <footer className="border-t border-white/10">
          <div className="mx-auto max-w-5xl px-6 py-10 text-xs text-neutral-400">
            © {new Date().getFullYear()} Tee365
          </div>
        </footer>
      </body>
    </html>
  );
}
