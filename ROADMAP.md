# Tee365 — Project Roadmap

## Where We Are

The main marketing site (`tee365.org`) and the booking app have been merged into a single Next.js 16 project (this repo). The booking app routes are live but unlinked from the marketing site — no nav links until product testing is complete.

### What's built and deployed
- **Marketing site** — home, about, FAQ, contact, SEO page (all under `app/(marketing)/`)
- **Auth** — `/signup`, `/login`, `/account` with Supabase auth, disclosure acknowledgments on signup
- **Booking flow** — `/book`: bay selection, date/time picker, Stripe payment, access code generation
- **SMS confirmation** — Twilio fires on `payment_intent.succeeded` with bay name, time, and access code
- **Admin panel** — `/admin/bookings`: view all bookings, cancel with Stripe refund
- **Display board** — `/display`: unauthenticated kiosk view (excluded from proxy auth)
- **Pricing engine** — rules-based by season/day/time, stored in `pricing_rules` table
- **Memberships** — discount logic in booking flow, `memberships` + `membership_plans` tables exist
- **Coupons + gift cards** — validation and application in booking flow, tables exist

### Tech stack
- Next.js 16.1.6 (Turbopack, `proxy.ts` middleware convention)
- Supabase (auth + Postgres)
- Stripe (payments, webhook at `/api/stripe/webhook`)
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
- [ ] Seed Supabase: confirm `bays` table has active bays configured
- [ ] Seed Supabase: confirm `pricing_rules` rows exist (season/day/time combinations)
- [ ] End-to-end test: signup → login → book → Stripe payment → SMS confirmation
- [ ] Verify access code arrives via SMS and is stored on the booking
- [ ] Test failed payment path (booking stays pending/cancelled correctly)
- [ ] Test booking conflict detection (same bay, overlapping time)
- [ ] Test `/admin/bookings` — view, cancel, refund flow
- [ ] Test `/display` board renders correctly
- [ ] Verify Stripe webhook is registered in Stripe dashboard pointing to `https://tee365.org/api/stripe/webhook`
- [ ] Add `/book` link to marketing site header once testing passes

### 🟡 Shortly after launch
- [ ] Membership purchase flow — UI to buy a plan (tables exist, no purchase page yet)
- [ ] Account page improvements — show upcoming/past bookings
- [ ] Admin: bay management (activate/deactivate bays)
- [ ] Admin: blocked times management (create/delete blocked slots)
- [ ] Admin: pricing rules editor
- [ ] Admin: coupon creation and management
- [ ] Email confirmation (currently SMS only)

### 🟢 Later
- [ ] Gift card purchase flow
- [ ] Admin: gift card issuance
- [ ] Membership renewal / cancellation self-serve
- [ ] Booking rescheduling
- [ ] Public availability calendar (unauthenticated preview)
