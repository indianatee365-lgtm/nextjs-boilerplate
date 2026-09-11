import fs from "node:fs"
import path from "node:path"
import type { MetadataRoute } from "next"

// Derived from the filesystem rather than hand-maintained. The hand-kept list
// had silently drifted: /join, the membership conversion page, and /terms were
// both indexable with their own canonical tags yet missing from the sitemap,
// found during the 2026-09-11 audit. Adding a marketing page now puts it in
// the sitemap automatically, and the only way to leave one out is to say so
// explicitly in EXCLUDED below.
//
// Every indexable page lives under app/(marketing), so that's the whole scan.
// /guide and /guide/courses sit outside it and ship robots noindex,nofollow on
// purpose: customer reference material, not search content.

const BASE = "https://tee365.org"
const MARKETING_DIR = path.join(process.cwd(), "app", "(marketing)")

// Real pages we don't want indexed. Transactional dead ends, all of them: a
// customer lands here mid-flow and there's nothing for a searcher to find.
const EXCLUDED = new Set([
  "/join/checkout",
  "/join/checkout/return",
  "/gift-cards/success",
  "/unsubscribed",
])

// Editorial ranking, which is the one thing the filesystem can't tell us.
// A page that isn't listed still gets into the sitemap, just at the default
// weight, so forgetting to add an entry here costs ranking rather than
// visibility.
const RANKING: Record<string, { priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = {
  "/": { priority: 1, changeFrequency: "weekly" },
  "/join": { priority: 0.9, changeFrequency: "weekly" },
  "/indoor-golf-simulator-south-bend": { priority: 0.9, changeFrequency: "weekly" },
  "/founders": { priority: 0.9, changeFrequency: "weekly" },
  "/events": { priority: 0.8, changeFrequency: "monthly" },
  "/technology": { priority: 0.8, changeFrequency: "monthly" },
  "/gift-cards": { priority: 0.7, changeFrequency: "monthly" },
  "/faq": { priority: 0.6, changeFrequency: "monthly" },
  "/about": { priority: 0.5, changeFrequency: "monthly" },
  "/contact": { priority: 0.5, changeFrequency: "yearly" },
  "/privacy": { priority: 0.3, changeFrequency: "yearly" },
  "/terms": { priority: 0.3, changeFrequency: "yearly" },
  "/sms-opt-in": { priority: 0.3, changeFrequency: "yearly" },
}

const DEFAULT_RANKING = { priority: 0.5, changeFrequency: "monthly" as const }

// Walks for page.tsx files and turns each one's directory into its route.
// Nested route groups collapse away like Next's router does, and dynamic
// segments are skipped: a [slug] page has no single URL to list, and if we
// ever add one worth indexing it needs real generateStaticParams here anyway.
function collectRoutes(dir: string, routePrefix = ""): string[] {
  const routes: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === "page.tsx") routes.push(routePrefix || "/")
      continue
    }
    if (entry.name.startsWith("[") || entry.name.startsWith("_") || entry.name === "components") continue
    const isRouteGroup = entry.name.startsWith("(") && entry.name.endsWith(")")
    routes.push(...collectRoutes(
      path.join(dir, entry.name),
      isRouteGroup ? routePrefix : `${routePrefix}/${entry.name}`,
    ))
  }
  return routes
}

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  // Runs at build time, where app/ is on disk. Falling back to the ranked
  // routes if the scan comes up empty means a moved directory costs us the
  // automatic part, not the entire sitemap.
  let routes: string[] = []
  try {
    routes = collectRoutes(MARKETING_DIR)
  } catch {
    routes = []
  }
  if (routes.length === 0) routes = Object.keys(RANKING)

  const lastModified = new Date()

  return routes
    .filter(route => !EXCLUDED.has(route))
    .map(route => {
      const { priority, changeFrequency } = RANKING[route] ?? DEFAULT_RANKING
      return { url: route === "/" ? `${BASE}/` : `${BASE}${route}`, lastModified, changeFrequency, priority }
    })
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.url.localeCompare(b.url))
}
