// Custom events and tags for Microsoft Clarity, so recordings can be filtered
// by how far someone got: "reached payment and paid" vs "reached payment and
// left". Fire and forget: does nothing if Clarity isn't loaded (blocked, admin
// or account pages, local dev) and never throws.
//
// Events in use (2026-11-10):
//   book_view, book_date, book_time, book_login, book_reserved, book_paid
//   join_checkout, join_paid
//   giftcard_checkout, giftcard_paid
// The book_* steps mirror lib/funnel.ts, which feeds /admin/funnel.

type ClarityFn = (command: string, ...args: string[]) => void

function clarity(): ClarityFn | null {
  if (typeof window === "undefined") return null
  // Same typeof guard as app/components/Clarity.tsx: window.clarity can be a
  // DOM element before the tag loads.
  const c = (window as unknown as { clarity?: unknown }).clarity
  return typeof c === "function" ? (c as ClarityFn) : null
}

export function clarityEvent(name: string) {
  try { clarity()?.("event", name) } catch { /* never break the page */ }
}

export function clarityTag(key: string, value: string) {
  try { clarity()?.("set", key, value) } catch { /* never break the page */ }
}
