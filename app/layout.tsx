import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
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
