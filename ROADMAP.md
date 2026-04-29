# Tee365 — Project Roadmap

## Where We Are

The main marketing site (`tee365.org`) and the booking app have been merged into a single Next.js 16 project (this repo). The booking app routes are live but unlinked from the marketing site — no nav links until product testing is complete.

### What's built and deployed
- **Marketing site** — home, about, FAQ, contact, SEO page (all under `app/(marketing)/`)
- **Auth** — `/signup`, `/login`, `/account` — signup → login flow confirmed working
- **Booking flow** — `/book`: date/time picker (no bay selection — auto-assigned), Stripe embedded PaymentElement, access code generation; midnight rollover works for 24/7 model; all times in America/Indiana/Indianapolis. Payment step shows server-confirmed pricing (includes membership discounts and coupons).
- **My Bookings** — `/account/bookings`: upcoming + past bookings with status, access code display, confirmed banner after payment
- **Disclosures** — shown at booking review step (before payment), not signup
- **SMS confirmation** — fires on `payment_intent.succeeded`: "Booking confirmed, access code coming 10–20 min before your session"
- **SMS access code** — cron fires 15 min before session, generates access code, SMSs customer, calls `grantBayAccess()` stub for access control integration
- **Access control stub** — `lib/access-control/index.ts` ready to wire up when system is defined
- **Admin panel** — `/admin/bookings`: calendar grid view, cancel with Stripe refund, manual confirm + SMS button for pending bookings; requires `role = 'admin'` in profiles table. Cancel correctly handles both cases: cancels PaymentIntent for pending bookings, issues refund for confirmed bookings. Webhook guarded with `.neq("status", "cancelled")` to prevent re-confirmation.
- **Display board** — `/display`: unauthenticated kiosk view (excluded from proxy auth)
- **Pricing engine** — rules-based by season/day/time, stored in `pricing_rules` table
- **Memberships** — discount logic in booking flow, `memberships` + `membership_plans` tables exist
- **Coupons + gift cards** — validation and application in booking flow, tables exist

### Tech stack
- Next.js 16.1.6 (Turbopack, `proxy.ts` middleware convention)
- Supabase (auth + Postgres) — email confirmation disabled, signups working
- Stripe (payments, webhook at `/api/stripe/webhook`) — test keys active
- Twilio (SMS)
- Vercel (hosting, tee365.org domain)

### Repo situation
- This repo (`nextjs-boilerplate`) is the **live codebase** — deploys to `tee365.org`
- `tee365-app` repo is **superseded** — do not deploy from it, it's a reference only

---

## Where We're Going

Get the booking flow production-ready and open it to customers. Then build out the remaining admin and membership features.

---

## Todo

### 🔴 Before going live (product testing)
- [x] Signup → login flow working (Supabase email confirmation disabled)
- [x] Bays table seeded and active (Bay 1, Bay 2 confirmed)
- [x] Pricing rules seeded (bookings pricing correctly)
- [x] End-to-end test: book → Stripe test payment (card 4242...) → booking created
- [x] `/account/bookings` page — upcoming/past bookings with access code display
- [x] Admin panel accessible at `/admin/bookings` (requires `role = 'admin'` in profiles)
- [x] Manual confirm + SMS button in admin for pending bookings
- [x] Stripe webhook fixed — duplicate endpoints removed, signing secret matched
- [x] Access code flow: generated at 15-min mark (not at payment), sent via cron
- [x] pg_cron + pg_net enabled in Supabase; reminder job scheduled every 5 min
- [x] Twilio credentials set in Vercel — SMS blocked by A2P 10DLC (not a code issue)
- [x] Twilio number purchased: (574) 406-2332
- [x] A2P 10DLC brand + campaign registration submitted — first submission rejected (CTA/privacy URL), resubmitted Apr 27 2026 with consent disclosure on signup form and real privacy policy URL (tee365.org/privacy); pending carrier approval
- [x] Privacy policy (`/privacy`) and Terms (`/terms`) pages live for Twilio registration
- [x] Admin dashboard working — all pages load, times in ET, today's bookings count correct
- [x] Calendar today-clickable fix deployed (SSR timezone issue resolved)
- [x] Next available slot scans all 4 bays correctly
- [ ] **Verify SMS end-to-end once A2P 10DLC approved** — book session, confirm SMS + 15-min access code
- [ ] Fix CRON_SECRET mismatch — pg_cron getting 401 on `/api/cron/booking-reminders`
- [ ] Wire up access control API in `lib/access-control/index.ts`
- [ ] Test failed payment path (booking stays pending/cancelled correctly)
- [ ] Test booking conflict detection (same bay, overlapping time)
- [ ] Test cancel + Stripe refund from admin panel *(code fixed — pending → cancels PaymentIntent, confirmed → refunds charge; needs E2E test)*
- [ ] Switch Stripe from test keys to live keys
- [ ] Add `/book` link to marketing site header once testing passes

### 🔵 Go Live 1st — before opening to customers

> Full membership specs in `docs/members.md`. Full database implementation guide in `docs/website_database.md`.

#### Membership tiers
| Tier | Monthly | Joining fee | Annual option | Discount | Booking window | Max reservations |
|---|---|---|---|---|---|---|
| Birdie | $10/mo | None | $89/yr | 10% | 10 days | 2 |
| Eagle | $39/mo | None | $349/yr | 20% | 14 days | 3 |
| Founder's Club | $29/mo | $199 one-time | None | 20% (30% yr 1), floor $20/hr | 21 days | 3 |

Founders limited to 100 ever. Sales close **August 18, 2026** or at cap, whichever comes first. Founder signup bonus = 2 free hours at Founders and Friends Day (Aug 31, 2026). All pre-launch annual purchases start September 1, 2026 regardless of purchase date.

#### Database (Supabase — migration in `supabase/migrations/20260421_membership_system.sql`)
> Claude can run SQL directly against the Supabase database via the linked CLI — no copy/paste needed. Just ask.
- [x] `membership_plans` populated — birdie, eagle, founder's club with correct pricing/discounts/windows/caps
- [x] `memberships` table updated — plan_type, founder_number, year_one_discount_expires_at, bonus hours, pause fields, etc.
- [x] `bookings` table updated — member_rate_applied, discount_percent_applied, rate_type columns added
- [x] `assign_founder_number()` function deployed — sequential, advisory-lock protected
- [x] `enforce_founder_cap` trigger deployed — blocks insert beyond 100 paid founders
- [x] `member_effective_pricing` view deployed
- [x] `validate_booking_window()` function deployed
- [x] `check_reservation_cap()` function deployed
- [ ] Schedule pg_cron job to flip `pending_opening` → `active` at 4:00 AM UTC on Sept 1, 2026

#### Website
- [x] `/join` membership landing page — tier comparison, live spot counter, sold-out/close-date fallback
- [x] `/founders` private (noindex) marketing page — full benefit detail, note from Jerrod, policy summary, CTA
- [x] Membership signup flow — Birdie/Eagle monthly, Founder's Club (joining fee + $29/mo); Stripe Checkout Session via `POST /api/memberships/checkout`; auto-creates Founder's Stripe price if missing; $199 joining fee added to first invoice via `add_invoice_items`
- [x] Founder number assigned in `checkout.session.completed` webhook — sequential, idempotent
- [x] Eagle signup bonus (2 hrs, 90-day expiry) set in webhook
- [x] Founder year-one discount expiry (Aug 31, 2027) set in webhook
- [ ] Founder confirmation email: member number, Founders Wall acknowledgment, private update channel access
- [ ] Add `checkout.session.completed` to Stripe webhook event list in dashboard (required for membership creation to fire)
- [ ] Member dashboard section on `/account` — tier, discount, booking window, active reservations, bonus hours, status
- [ ] Update booking flow to enforce booking window and reservation cap per tier
- [ ] `/founders` private page — authenticated, `founder_number IS NOT NULL`, construction updates and news
- [ ] Pre-opening calendar access: Founders 48 hrs first (Sept 1), Eagle/Birdie Sept 3, public Sept 4
- [ ] Admin: manually assign/override membership tier
- [ ] Admin: Founder cap milestone alerts (50/75/85/95/100 sold)
- [ ] Admin: membership reporting views (members by tier, MRR, churn, utilization)
- [ ] Cancellation and refund policy page (annual proration: unused months × monthly rate − $25 fee, no refund after month 9)
- [ ] Terms of membership page

#### Payments
- [x] Stripe: one-time joining fee + recurring monthly combo for Founder signup
- [ ] Stripe: one-time annual charge for Season Pass purchases
- [ ] Annual refund calculation in admin panel

#### Gift cards
- [ ] Customer-facing gift card purchase flow
- [ ] Admin: gift card issuance UI

### 🔵 Go Live 2nd — open booking to the public
- [ ] Remove auth gate from `/book` — let unauthenticated users browse dates and times freely (one line to remove in `app/(public)/book/page.tsx`)
- [ ] Add "Book Now" to marketing site header nav
- [ ] Sign-in/sign-up at the review step is already wired (return URL + sessionStorage slot restore in place)

### 🟠 Sales Tax — Needs Answers Before Going Live

Indiana charges 7% sales tax on amusement/recreation services. Tee365 almost certainly falls under this. **Get accountant confirmation on two questions before implementing:**

1. Are one-time bay bookings taxable? (Almost certainly yes — amusement admission.)
2. Are monthly membership fees taxable? (Possibly — depends on whether they're treated as a service subscription or a club membership. Indiana has specific rules here.)

#### Implementation plan (once questions answered)

**Bookings (one-time payments):**
- Add `tax_rate: 0.07` constant to the pricing engine (`lib/pricing/engine.ts`)
- Add `tax` and `total_with_tax` to the `calculateBookingPrice()` return value
- Add `tax` column to the `bookings` table (numeric, default 0)
- Store tax amount on the booking record at creation time
- Display tax line item on the booking review step
- Stripe PaymentIntent amount already uses the calculated total — just include tax in it
- Update the booking confirmation SMS/email to show the tax line

**Memberships (recurring Stripe Checkout):**
- If membership fees are taxable: add a `price_data` line item for the tax amount to the Checkout Session, or enable `automatic_tax` on Stripe Checkout (Stripe Tax, $0.50/transaction) — Stripe Tax is the cleaner option here since it handles the line-item display automatically
- If membership fees are not taxable: no change needed

**Reporting:**
- Add a simple admin query/export: sum of `tax` column by month from `bookings` table
- Indiana DOR requires quarterly filing (ST-103) — export gives you the number to plug in
- File at inbiz.in.gov

### 🔐 Security (audit completed Apr 28 2026)
- [x] Deleted `/api/stripe-test` — publicly accessible debug endpoint, exposed Stripe key prefix
- [x] Added auth check to `GET /api/memberships/checkout/status` — was unauthenticated (IDOR)
- [x] Fixed signup error message — was leaking raw Supabase error ("User already exists") enabling email enumeration
- [x] Fixed cron secret bypass — if `CRON_SECRET` env var was unset, any request with `Bearer undefined` would pass
- [x] Replaced `Math.random()` with `crypto.randomInt()` for access code generation
- [x] Added security headers to `next.config.ts` — `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `HSTS`, `Permissions-Policy`
- [x] Disabled `X-Powered-By: Next.js` header (`poweredByHeader: false`)
- [x] Cloudflare Turnstile wired to login + signup forms — live and working (Apr 28 2026)
- [x] Turnstile env vars added in Vercel (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`)
- [x] **Put Cloudflare in front of tee365.org** (orange-cloud DNS mode) — nameservers pointed Apr 29 2026, active and proxying
- [ ] Stripe webhook idempotency — store processed `event.id` to prevent duplicate webhook delivery side-effects (duplicate coupon/gift card deductions)
- [ ] Supabase RLS audit — verify Row Level Security is ON for `bookings`, `profiles`, `memberships`
- [ ] Content Security Policy — complex with Stripe Elements + Turnstile; do after those are stable in prod

### 🟡 Shortly after launch
- [ ] Admin: bay management (activate/deactivate bays)
- [ ] Admin: pricing rules editor
- [ ] Admin: coupon creation and management
- [ ] Email confirmation on booking (currently SMS only)

### 🟢 Later
- [ ] Membership renewal / cancellation self-serve
- [ ] Booking rescheduling
- [ ] Public availability calendar (unauthenticated preview)
