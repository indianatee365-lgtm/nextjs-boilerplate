import type { MetadataRoute } from "next"

// Hand-maintained on purpose (only a dozen indexable pages, and priority
// ordering is an editorial call), but it had silently drifted: /join - the
// membership conversion page - and /terms were both indexable with their own
// canonical tags yet missing here, found during the 2026-09-11 audit.
//
// When adding a public marketing page, add it here too.
//
// Deliberately NOT listed, so the next person can tell "omitted on purpose"
// from "forgotten":
//   /guide, /guide/courses          ship robots noindex,nofollow - customer
//                                   reference material, not search content
//   /join/checkout(/return),        transactional dead ends
//   /gift-cards/success,
//   /unsubscribed
//   /book, /login, /signup,         auth-gated or app surfaces
//   /account, /admin, /display

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://tee365.org"

  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/join`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${base}/indoor-golf-simulator-south-bend`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${base}/founders`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${base}/events`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/technology`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${base}/gift-cards`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${base}/faq`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${base}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${base}/contact`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${base}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/sms-opt-in`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ]
}
