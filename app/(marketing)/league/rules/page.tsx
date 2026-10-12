import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { LEAGUE_SLUG, type League } from "@/lib/league"
import { FAQ, RULES, SIM_SETTINGS } from "@/lib/league/rules"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "League Rules | Tee365 Thursday Night League",
  description: "Every rule of the Tee365 Thursday Night League: format, handicaps, scoring, absences, money, prizes, simulator settings and courses.",
  alternates: { canonical: "https://tee365.org/league/rules" },
}

export default async function LeagueRulesPage() {
  // League tables are newer than lib/supabase/types.ts, so this client is untyped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service: any = await createServiceClient()
  const { data: leagueRow } = await service.from("leagues").select("*").eq("slug", LEAGUE_SLUG).maybeSingle()
  const league = leagueRow as League | null
  if (!league) notFound()

  // Same visibility as /league: hidden until published, except to admins and
  // the league's preview list.
  if (!league.active) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let allowed = false
    if (user) {
      const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle()
      allowed = (profile as { role: string } | null)?.role === "admin" || (league.preview_user_ids ?? []).includes(user.id)
    }
    if (!allowed) notFound()
  }

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      {!league.active && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Preview. Customers can&apos;t see this page until the league is published.
        </div>
      )}

      <header>
        <Link href="/league" className="text-sm text-neutral-400 hover:text-white">&larr; {league.name}</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">League rules</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          Every rule, written down before anyone tees off. If something isn&apos;t covered here, the commissioner decides, and we add it to this page.
        </p>
        <nav className="mt-5 flex flex-wrap gap-2 text-xs">
          {[...RULES.map((s) => s.title), "Simulator settings", "Courses", "FAQ"].map((t) => (
            <a key={t} href={`#${slug(t)}`} className="rounded-full border border-white/10 px-3 py-1.5 text-neutral-300 hover:border-white/30 hover:text-white">{t}</a>
          ))}
        </nav>
      </header>

      {RULES.map((section) => (
        <section key={section.title} id={slug(section.title)} className="scroll-mt-24">
          <h2 className="mb-3 text-lg font-semibold text-white">{section.title}</h2>
          <ul className="space-y-2.5 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-neutral-300">
            {section.rules.map((r) => (
              <li key={r} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{r}</li>
            ))}
          </ul>
        </section>
      ))}

      <section id={slug("Simulator settings")} className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold text-white">Simulator settings</h2>
        <p className="mb-3 text-sm text-neutral-400">Every bay, every league night, checked before the first tee time.</p>
        <dl className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5 text-sm">
          {SIM_SETTINGS.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-6">
              <dt className="w-40 shrink-0 font-semibold text-white">{k}</dt>
              <dd className="text-neutral-300">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id={slug("Courses")} className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold text-white">Courses</h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          A different course every week, with courses like Pebble Beach, Payne&apos;s Valley, Bandon Trails and Mammoth Dunes. Each week&apos;s course is announced the week of play, in your text the night before, and every bay plays the same course with the same settings on the night.
        </p>
      </section>

      <section id="faq" className="scroll-mt-24">
        <h2 className="mb-3 text-lg font-semibold text-white">FAQ</h2>
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {FAQ.map(([q, a]) => (
            <div key={q} className="p-5">
              <p className="text-sm font-semibold text-white">{q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}
