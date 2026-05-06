# Tee365 — Project Context for Claude

Live codebase, deploys to **tee365.org** via Vercel. Supabase CLI is linked — Claude can run SQL directly with `supabase db query --linked`.

## Stack
Next.js 16, Supabase (auth + Postgres), Stripe, Twilio, Resend, Vercel

## What's built and working
- **Booking flow** — date → time → review → Stripe payment. Server-confirmed pricing with membership discounts, coupons, gift cards, 7% Indiana sales tax.
- **Admin panel** — `/admin/bookings`, `/admin/bays`, `/admin/users`, `/admin/gift-cards`. Admins auto-redirect to `/admin` on login.
- **Access code cron** — fires 15 min before session via pg_cron + pg_net.
- **Display board** — `/display`, unauthenticated kiosk view.
- **Pricing engine** — rules-based by season/day/time in `pricing_rules` table.
- **Self-service cancel** — `/account/bookings`. >24h = full Stripe refund. ≤24h = forfeit, explicit warning.
- **Self-service reschedule** — `/account/bookings/[id]/reschedule`. Cutoff: **4h before session**. Fee: **$5 flat**. Repriced at new slot's actual rate (arbitrage-proof). Delta charged/refunded via Stripe. 3DS via return page. Policy in /terms Section 4 and /faq.
- **Gift cards** — `/gift-cards` (login-gated until Stripe goes live). $25/$50/$100/custom. Stripe Checkout → idempotent DB insert → branded email. Balance checker on same page. Admin issuance at `/admin/gift-cards`. Codes: `XXXX-XXXX-XXXX`.
- **Membership system** — Birdie ($10/mo, 10% off, 10-day window), Eagle ($39/mo, 20% off, 14-day), Founder's Club ($29/mo + $199 joining, 20%/30% yr1, 21-day, 100 cap, closes Aug 18 2026). `/join` public page, `/founders` private page, Stripe Checkout flow, webhook creates membership record.
- **Booking confirmation email** — fires on `payment_intent.succeeded` and admin manual confirm. Receipt with all line items. `lib/resend/email.ts`.
- **Gift card email** — branded "You've Got a Gift" email with code. Same file.
- **Security** — Cloudflare orange-cloud, Turnstile on login + signup, RLS on all tables, security headers, no `X-Powered-By`.

## SMS (Twilio)
A2P 10DLC rejected 4 times. As of May 5 2026: explicit SMS consent checkbox added to signup (server-validated), STOP/HELP opt-out added to both message templates. Campaign copy at `docs/twilio-a2p-campaign.md`. **Pending resubmission.** Twilio number: (574) 406-2332.

## Email (Resend)
Free tier, 3k/mo. Domain tee365.org verified. `from` address: `bookings@tee365.org`.
**`RESEND_API_KEY` is NOT yet set in Vercel** — emails are silently failing. Fix: resend.com → API Keys → Vercel project → Settings → Environment Variables → add `RESEND_API_KEY` → redeploy.

## Sales tax
7% Indiana flat rate. Calculated on post-discount amount before gift cards. Stored in `bookings.tax`. Membership fee taxability TBD (pending accountant).

## Pre-launch checklist (short version)
1. Add `RESEND_API_KEY` to Vercel env vars → redeploy
2. Resubmit Twilio A2P campaign (`docs/twilio-a2p-campaign.md`)
3. Verify SMS end-to-end once A2P approved
4. Fix CRON_SECRET mismatch (pg_cron → 401 on `/api/cron/booking-reminders`)
5. Wire up access control API (`lib/access-control/index.ts` stub)
6. Test failed payment, conflict detection, cancel+refund E2E
7. Switch Stripe to live keys
8. Add `checkout.session.completed` to Stripe webhook event list (gift card webhook backup)
9. Schedule pg_cron: flip `pending_opening` → `active` at 4:00 AM UTC Sept 1, 2026
10. Remove login gate from `/gift-cards` + update FAQ gift card answer once Stripe is live

Full checklist: `ROADMAP.md`

## Key docs
- `docs/members.md` — canonical membership specs
- `docs/website_database.md` — database implementation guide
- `docs/twilio-a2p-campaign.md` — Twilio A2P campaign copy ready to paste
