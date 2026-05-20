# Tee365 — Project Roadmap

## Phases

| Phase | Status | Description |
|---|---|---|
| **Pre-launch** | ✅ Current | Internal testing only. No real money. No public access. |
| **Partly Live** | ⏳ Next | Real Stripe keys. Gift cards + memberships open to the public. Booking still locked. |
| **Launch — Sept 1, 2026** | 🔒 Sept 1 | Booking opens. Tiered access: Founders first, then Eagle/Birdie, then public. |

---

## Where We Are

The main marketing site (`tee365.org`) and the booking app are merged into a single Next.js 16 project. The booking app routes are live but unlinked from the marketing site — no nav links until go-live.

### What's built and deployed
- **Marketing site** — home, about, FAQ, contact, SEO page (all under `app/(marketing)/`)
- **Auth** — `/signup`, `/login`, `/account` — signup → login flow confirmed working
- **Booking flow** — `/book`: date/time picker (auto-assigned bays), Stripe embedded PaymentElement, access code generation; midnight rollover works; all times in America/Indiana/Indianapolis
- **My Bookings** — `/account/bookings`: upcoming + past bookings with status, access code display, confirmed banner after payment
- **Disclosures** — shown at booking review step (before payment), not signup
- **SMS confirmation** — fires on `payment_intent.succeeded` ✅ live and confirmed working 2026-05-19
- **SMS access code** — pg_cron fires every 5 min, sends code 10–20 min before session ✅ confirmed working 2026-05-19
- **Access control stub** — `lib/access-control/index.ts` ready to wire when hardware is selected
- **Admin panel** — `/admin/bookings`: calendar grid view, cancel + Stripe refund, manual confirm + SMS; requires `role = 'admin'`
- **Display board** — `/display`: unauthenticated kiosk view
- **Pricing engine** — rules-based by season/day/time, stored in `pricing_rules` table
- **Memberships** — Birdie/Eagle/Founder's Club; discount logic, booking windows, reservation caps, Founder number assignment all working
- **Coupons + gift cards** — validation and application in booking flow; gift card purchase flow built (login-gated until Stripe goes live)
- **Minor consent system** — is_minor + parental consent flow; booking-gated; launch-ready

### Tech stack
- Next.js 16.1.6 (Turbopack)
- Supabase (auth + Postgres) — email confirmation disabled
- Stripe (payments) — **test keys active**
- Telnyx (SMS) — A2P campaign CPYCUBI approved 2026-05-19
- Resend (email)
- Vercel (hosting, tee365.org)
- Cloudflare (proxy, Turnstile)
- Upstash Redis (rate limiting)

### Repo
- **Live repo:** `github.com/indianatee365-lgtm/nextjs-boilerplate` → `tee365.org`
- **Dead/archived:** `indianatee365-lgtm/tee365-app` — do not use

---

## Phase 1 — Pre-launch (Current)

> Goal: Everything works correctly before any real money changes hands.

### Done ✅
- [x] Signup → login flow (Supabase email confirmation disabled)
- [x] Bays seeded and active (Bay 1, Bay 2)
- [x] Pricing rules seeded and correct
- [x] End-to-end test: book → Stripe test payment → booking created
- [x] `/account/bookings` — upcoming/past with access code display
- [x] Admin panel at `/admin/bookings` (requires `role = 'admin'`)
- [x] Manual confirm + SMS button in admin
- [x] Stripe webhook fixed — duplicate endpoints removed, signing secret matched
- [x] Access code flow: generated 10–20 min before session via cron
- [x] pg_cron + pg_net enabled; booking-reminders job running every 5 min
- [x] Telnyx A2P 10DLC approved — SMS confirmed working end-to-end 2026-05-19
- [x] Privacy policy + Terms pages live
- [x] Admin dashboard — all pages, ET times, today's count
- [x] Next available slot scans all bays, picks global earliest
- [x] CRON_SECRET set and working (no more 401s on cron)
- [x] Booking conflict detection — `scripts/test-conflicts.sql` 9/9 passing
- [x] Cancel + Stripe refund — `scripts/test-cancel.sql` 11/11 passing; E2E verified
- [x] Confirmation emails via Resend — working
- [x] Booking reservation timer (15-min hold at review step)
- [x] SMS consent overhaul — opt-in toggle, `sms_consent` column, all sends gated
- [x] Membership checkout working (all 3 tiers)
- [x] Self-service cancel + reschedule
- [x] Security audit complete (CSP A+, RLS audit, CVE patches, Turnstile, Cloudflare)

### Remaining 🔴
- [ ] Wire access control API (`lib/access-control/index.ts` stub — blocked on hardware selection)
  - Access code is 6 digits; final digit count TBD pending hardware
- [ ] Test failed payment path (booking stays pending/cancelled correctly)
- [ ] Stripe webhook idempotency — store processed `event.id` to prevent duplicate side-effects
- [ ] Rate limiting — configure Cloudflare rules for auth, gift card balance, coupon redemption
- [ ] **Sales tax** — Indiana 7% on amusement/recreation. Get accountant confirmation on:
  1. Are one-time bay bookings taxable? (Almost certainly yes)
  2. Are monthly membership fees taxable? (Indiana-specific rules)
  - Implementation plan is written in the old roadmap — hold until confirmed

---

## Phase 2 — Partly Live

> Goal: Take real money for memberships and gift cards. Booking still locked.
> Unlocked by: switching Stripe to live keys.
> Birdie/Eagle hidden until ~Aug 25 — only Founder's Club available to drive founding memberships.

### Stripe go-live (unlocks everything in this phase)
- [ ] Switch Stripe from test keys to live keys
- [ ] Add `checkout.session.completed` to live Stripe webhook event list
- [ ] Verify Apple Pay domain registration carries to live mode

### Marketing site updates
- [ ] Homepage: add Founding Member purchase CTA buttons (link to `/founders`)
- [ ] Homepage: update gift card section from "coming soon" to "live now" with purchase link
- [ ] Hide Birdie/Eagle on `/join` — show Founder's Club only until ~Aug 25

### Gift cards — pre-launch promotion
- [ ] Remove login gate from `/gift-cards` and balance checker
- [ ] Apply 20% pre-launch discount on gift card purchases (ends Aug 31, 2026)
  - $100 card sells for $80, $50 for $40, $25 for $20 — customer gets full face value at the door
  - Strategy: $20 customer acquisition cost; they tell friends, CAC drops fast
- [ ] Update FAQ gift card answer to "now live"

### Founding Members — public-facing
- [ ] Founders page (`/founders`) live and polished — ready for real purchases
- [ ] Founder confirmation email: member number, Founders Wall acknowledgment, private update channel
- [ ] `/founders` private authenticated area (founder_number IS NOT NULL) — construction updates, news
- [ ] Member dashboard section on `/account` — tier, discount, booking window, active reservations, bonus hours

### Birdie/Eagle reveal (~Aug 25, 2026 — one week before public launch)
- [ ] Unhide Birdie/Eagle on `/join` page
- [ ] Update marketing site to announce all membership tiers available

### Admin — membership management
- [ ] Admin: manually assign/override membership tier
- [ ] Admin: Founder cap milestone alerts (50/75/85/95/100 sold)
- [ ] Admin: membership reporting views (members by tier, MRR, churn, utilization)

### Housekeeping
- [ ] Close Twilio account at console.twilio.com — request $27 refund

---

## Phase 3 — Launch (Sept 1, 2026)

> Goal: Booking opens to the public with tiered access.
> Founders Day: Aug 31, 2026 (2 free hours for Founders).
> Pre-opening window: Founders Sept 1 → Eagle/Birdie Sept 3 → Public Sept 4.

### Booking go-live
- [ ] Schedule pg_cron job: flip `pending_opening` → `active` at 4:00 AM UTC Sept 1, 2026
- [ ] Update booking flow to enforce booking window and reservation cap per membership tier
- [ ] Pre-opening calendar access enforcement: Founders 48 hrs first, Eagle/Birdie Sept 3, public Sept 4
- [ ] Remove auth gate from `/book` (one line in `app/(public)/book/page.tsx`)
- [ ] Add `/book` link to marketing site header nav
- [ ] Add "Book Now" to marketing site header

### Payments
- [ ] Stripe: one-time annual charge for Season Pass purchases
- [ ] Annual refund calculation in admin panel
- [ ] Sales tax implementation (if accountant confirms — see Phase 1)

### Access control
- [ ] Wire `lib/access-control/index.ts` to real hardware (if not done in Phase 1)

---

## After Launch

### Shortly after
- [ ] Admin: bay management (activate/deactivate)
- [ ] Admin: pricing rules editor
- [ ] Admin: coupon creation and management
- [ ] Membership cancellation and refund policy page
- [ ] Terms of membership page
- [ ] Cancellation self-serve
- [ ] Public availability calendar (unauthenticated preview)
- [ ] Drop Zoho, switch to Cloudflare Email Routing (free, low priority)

### Known loopholes (fix if pattern emerges)
- [ ] **Reschedule-to-escape-forfeit**: customer within 24h forfeit window pays $5 reschedule fee, moves to future slot, cancels for full refund. Net cost: $5. Fix: add `forfeit_on_cancel` flag, set on reschedule within 24h, honor in `cancelBookingByCustomer`.

### Voice Agent (Telnyx + OpenAI Realtime)
Single number handles SMS and inbound voice. Customer calls → AI agent → unresolved → transfers to Jerrod's cell. After-hours: voicemail. Personal cell never exposed.

- [ ] Telnyx voice webhook configured (`tee365.org/api/voice/inbound`)
- [ ] Docker service: Node.js WS bridge + OpenAI Realtime API
- [ ] Troubleshooting tree system prompt
- [ ] Call transfer to Jerrod's cell via Telnyx Call Control
- [ ] After-hours logic (no transfer midnight–7am ET)
- [ ] End-to-end test
- [ ] Inbound SMS webhook handler

### Phone OTP (scaffold in place — not live)
- [ ] `phone_otp_hash` and `phone_otp_expires_at` columns on profiles
- [ ] `POST /api/auth/send-phone-otp` and `POST /api/auth/verify-phone-otp`
- [ ] OTP step in signup flow
- [ ] Gate booking on `phone_verified = true`

---

## Key Decisions & Gotchas

### Stripe membership checkout (critical)
`stripe ^22` / `2026-03-25.dahlia`: `subscriptions.create()` no longer returns a usable `client_secret`. Use `paymentIntents.create()` for the first charge, then create the subscription with `trial_end = now + 30 days` in the `payment_intent.succeeded` webhook. Avoids double-billing. Confirmed working 2026-05-15.

### Telnyx
- Number: +1 (574) 444-9365
- Campaign: CPYCUBI — approved 2026-05-19
- `TELNYX_API_KEY` had embedded newline when first set in Vercel — caused "invalid header value" error. Fixed 2026-05-19.

### Membership tiers
| Tier | Monthly | Joining fee | Discount | Booking window | Max reservations |
|---|---|---|---|---|---|
| Birdie | $10/mo | None | 10% | 10 days | 2 |
| Eagle | $39/mo | None | 20% | 14 days | 3 |
| Founder's Club | $29/mo | $199 one-time | 20% (30% yr 1) | 21 days | 3 |

Founders capped at 100. Sales close Aug 18, 2026 or at cap. Founder signup bonus = 2 free hours at Founders Day (Aug 31, 2026).

### Vercel Hobby
- Cron max = once/day. Sub-daily cron handled via pg_cron in Supabase (booking-reminders runs every 5 min via `net.http_get`).
- No Co-Authored-By in commits — Vercel Hobby blocks deploys.

### Security audit (completed Apr 28 / May 13 2026)
All items resolved — CSP Observatory A+ (115/100), RLS on all 17 tables, CVE patches applied, Cloudflare orange-cloud active, Turnstile on login/signup.
