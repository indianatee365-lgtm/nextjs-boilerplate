# Tee365 — Project Context for Claude

Live codebase, deploys to **tee365.org** via Vercel. Supabase CLI is linked — Claude can run SQL directly with `supabase db query --linked`. SSH from labwork (Windows) to labserver works.

## Stack
Next.js 16, Supabase (auth + Postgres), Stripe, Twilio, Resend, Vercel

## What's built and working
- **Booking flow** — date → time → review → Stripe payment. Server-confirmed pricing with membership discounts, coupons, gift cards, 7% Indiana sales tax. Payment confirmation gated via `/book/return` (checks Stripe `redirect_status=succeeded` before showing banner).
- **Stripe Customer / card on file** — `profiles.stripe_customer_id` stores Stripe Customer ID. Booking API creates Customer on first booking, saves card via `setup_future_usage: 'off_session'`. Next booking shows saved card in PaymentElement. `/account` page has full payment method management (view, remove, add via SetupIntent).
- **Admin panel** — `/admin/bookings`, `/admin/bays`, `/admin/users`, `/admin/gift-cards`, `/admin/coupons`, `/admin/members`. Admins auto-redirect to `/admin` on login. Dashboard has cancellations block (forfeit vs. refund visibility).
- **Access code cron** — fires 15 min before session via pg_cron + pg_net.
- **Display board** — `/display`, unauthenticated kiosk view.
- **Pricing engine** — rules-based by season/day/time in `pricing_rules` table.
- **Self-service cancel** — `/account/bookings`. >24h = full Stripe refund. ≤24h = forfeit, explicit warning. Known loophole tracked (reschedule to escape forfeit) — see ROADMAP "Known loopholes".
- **Self-service reschedule** — `/account/bookings/[id]/reschedule`. Cutoff: 4h before session. Fee: $5 flat. Repriced at new slot's actual rate. Delta charged/refunded via Stripe. 3DS via return page.
- **Gift cards** — `/gift-cards` (login-gated until Stripe goes live). $25/$50/$100/custom. Stripe Checkout → idempotent DB insert → branded email. Balance checker. Admin issuance at `/admin/gift-cards`.
- **Membership system** — Birdie ($10/mo, 10% off, 10-day window), Eagle ($39/mo, 20% off, 14-day), Founder's Club ($29/mo + $199 joining, 20%/30% yr1, 21-day, 100 cap, closes Aug 18 2026). `/join`, `/founders`, Stripe Checkout flow, webhook creates membership record.
- **Booking confirmation email** — fires on `payment_intent.succeeded` and admin manual confirm. Full receipt. `lib/resend/email.ts`. RESEND_API_KEY confirmed in Vercel.
- **Security** — Cloudflare orange-cloud, Turnstile on login + signup, RLS on all tables, security headers.

## Disclosures (overhauled 2026-05-12)
Three disclosures live in DB: Liability Waiver, Facility Rules, Guest & Age Policy. `disclosure_acknowledgments` stores `body_snapshot` (exact text agreed to at time of booking) and `booking_id`. Key policy points:
- Card storage disclosed in Liability Waiver
- Overstay: 15-min grace, then booked rate, card on file may be charged (contact first)
- Equipment damage: full repair/replacement cost, card on file, contact first
- Cameras: disclosed ("monitored by security cameras")
- Closure: 24h+ notice = full refund or reschedule; same-day = full refund
- Minors: 16-17 with parental consent on file; under 16 with adult present
- Capacity: 4 per bay (6 is physical max, not advertised)

## SMS (Twilio)
A2P 10DLC rejected 4 times. Pending resubmission. Campaign copy at `docs/twilio-a2p-campaign.md`. Twilio number: (574) 406-2332. **Blocked.**

## Sales tax
7% Indiana flat rate on post-discount amount before gift cards. Stored in `bookings.tax`. Membership fee taxability TBD (pending accountant).

## Test suites
- `scripts/test-conflicts.sql` — 9/9 passing. Run: `supabase db query --linked -f scripts/test-conflicts.sql`
- `scripts/test-cancel.sql` — 11/11 passing. Run: `supabase db query --linked -f scripts/test-cancel.sql`

## OTP scaffold (not live)
`profiles.phone_verified boolean default false` exists. Stub routes at `/api/auth/send-phone-otp` and `/api/auth/verify-phone-otp` (return 501). Full implementation plan in ROADMAP.

## Minor consent system (built 2026-05-12)
Option B — yes/no age question at signup (no DOB collected). Adults click yes, zero friction. Minors click no, parent email field appears.
- `profiles.is_minor`, `profiles.parental_consent_verified` columns
- `parental_consents` table: token (7-day expiry), parent_email, parent_name, consented_at, waiver_snapshot, ip_address
- Signup action creates consent record + emails parent via Resend
- `/minor-consent/[token]` — public page, parent signs, account unlocked, minor emailed
- `/minor-consent/complete` — confirmation page
- `/account/awaiting-consent` — holding page with resend button
- Booking gate: wrapped in `if (user)` so it survives auth gate removal at launch
- **At launch:** remove the one line marked `// LAUNCH: remove this line` in `app/(public)/book/page.tsx`

## Recourse process
Templates for damage/overstay at `docs/templates/recourse-contact.md`. Always contact customer before charging. Process: document → contact (48h) → charge if no response → send receipt.

## Pre-launch checklist (short version)
1. Resubmit Twilio A2P campaign — `docs/twilio-a2p-campaign.md` *(blocked)*
2. Verify SMS end-to-end once A2P approved *(blocked)*
3. Wire up access control API — `lib/access-control/index.ts` stub *(blocked on hardware)*
4. Switch Stripe to live keys (also add `checkout.session.completed` to the live webhook endpoint when doing this)
5. Schedule pg_cron: flip `pending_opening` → `active` at 4:00 AM UTC Sept 1, 2026
6. Remove login gate from `/gift-cards` + update FAQ gift card answer
7. Remove auth gate from `/book` — one line marked `// LAUNCH: remove this line` in `app/(public)/book/page.tsx`

Full checklist: `ROADMAP.md`

## Key docs
- `docs/members.md` — canonical membership specs
- `docs/website_database.md` — database implementation guide
- `docs/twilio-a2p-campaign.md` — Twilio A2P campaign copy ready to paste
- `docs/templates/recourse-contact.md` — damage/overstay contact templates
