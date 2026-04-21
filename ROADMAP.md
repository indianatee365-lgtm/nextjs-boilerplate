# Tee365 — Project Roadmap

## Where We Are

The main marketing site (`tee365.org`) and the booking app have been merged into a single Next.js 16 project (this repo). The booking app routes are live but unlinked from the marketing site — no nav links until product testing is complete.

### What's built and deployed
- **Marketing site** — home, about, FAQ, contact, SEO page (all under `app/(marketing)/`)
- **Auth** — `/signup`, `/login`, `/account` — signup → login flow confirmed working
- **Booking flow** — `/book`: date/time picker (no bay selection — auto-assigned), Stripe embedded PaymentElement, access code generation; midnight rollover works for 24/7 model; all times in America/Indiana/Indianapolis
- **My Bookings** — `/account/bookings`: upcoming + past bookings with status, access code display, confirmed banner after payment
- **Disclosures** — shown at booking review step (before payment), not signup
- **SMS confirmation** — fires on `payment_intent.succeeded`: "Booking confirmed, access code coming 10–20 min before your session"
- **SMS access code** — cron fires 15 min before session, generates access code, SMSs customer, calls `grantBayAccess()` stub for access control integration
- **Access control stub** — `lib/access-control/index.ts` ready to wire up when system is defined
- **Admin panel** — `/admin/bookings`: calendar grid view, cancel with Stripe refund, manual confirm + SMS button for pending bookings; requires `role = 'admin'` in profiles table
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
- [ ] **Verify Twilio credentials** set in Vercel env vars — no SMS received yet
- [ ] End-to-end SMS test: book a session ~15 min out, verify confirmation SMS + access code SMS
- [ ] Wire up access control API in `lib/access-control/index.ts`
- [ ] Test failed payment path (booking stays pending/cancelled correctly)
- [ ] Test booking conflict detection (same bay, overlapping time)
- [ ] Test cancel + Stripe refund from admin panel
- [ ] Test `/display` board renders correctly
- [ ] Switch Stripe from test keys to live keys
- [ ] Add `/book` link to marketing site header once testing passes

### 🟡 Shortly after launch
- [ ] Membership purchase flow — UI to buy a plan (tables exist, no purchase page yet)
- [ ] Admin: bay management (activate/deactivate bays)
- [ ] Admin: pricing rules editor
- [ ] Admin: coupon creation and management
- [ ] Email confirmation on booking (currently SMS only)
- [ ] Remove `/api/stripe-test` diagnostic endpoint

### 🟢 Later
- [ ] Gift card purchase flow
- [ ] Admin: gift card issuance
- [ ] Membership renewal / cancellation self-serve
- [ ] Booking rescheduling
- [ ] Public availability calendar (unauthenticated preview)
