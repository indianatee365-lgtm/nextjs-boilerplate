import Link from "next/link"
import { LayoutDashboard, ExternalLink, Phone, MessageSquare, ClipboardList, DollarSign, Users, Settings, Trophy } from "lucide-react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-white/10 bg-black/40 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/admin"
              className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <LayoutDashboard size={15} />
              Admin Dashboard
            </Link>
            <span className="text-neutral-700 hidden sm:inline">·</span>
            <Link
              href="/admin/phone"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <Phone size={13} />
              Phone Agent
            </Link>
            <span className="text-neutral-700 hidden sm:inline">·</span>
            <Link
              href="/admin/sms"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <MessageSquare size={13} />
              SMS
            </Link>
            <span className="text-neutral-700 hidden sm:inline">·</span>
            <Link
              href="/admin/incidents"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <ClipboardList size={13} />
              Incidents
            </Link>
            <span className="text-neutral-700 hidden sm:inline">&middot;</span>
            <Link
              href="/admin/audience"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <Users size={13} />
              Audience
            </Link>
            <span className="text-neutral-700 hidden sm:inline">&middot;</span>
            <Link
              href="/admin/pricing"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <DollarSign size={13} />
              Pricing
            </Link>
            <span className="text-neutral-700 hidden sm:inline">&middot;</span>
            <Link
              href="/admin/settings"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <Settings size={13} />
              Settings
            </Link>
            <span className="text-neutral-700 hidden sm:inline">&middot;</span>
            <Link
              href="/admin/league"
              className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <Trophy size={13} />
              League
            </Link>
            <span className="text-neutral-700 hidden sm:inline">·</span>
            <span className="text-xs text-neutral-600 hidden sm:inline">tee365.org</span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
          >
            View site
            <ExternalLink size={13} />
          </Link>
        </div>
      </nav>
      {children}
    </div>
  )
}
