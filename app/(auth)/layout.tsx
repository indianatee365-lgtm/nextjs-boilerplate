import Link from "next/link"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link href="/" className="text-lg font-bold text-white">Tee365</Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </>
  )
}
