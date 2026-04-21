import Link from "next/link"
import { LayoutDashboard } from "lucide-react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-white/10 bg-black/40 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <LayoutDashboard size={15} />
            Admin Dashboard
          </Link>
          <span className="text-neutral-700">·</span>
          <span className="text-xs text-neutral-600">tee365.org</span>
        </div>
      </nav>
      {children}
    </div>
  )
}
