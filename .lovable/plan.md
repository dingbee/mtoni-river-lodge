## Phase 1 — Website Audit (findings)

**Live functionality verified in the codebase:**
- Booking engine at `/book` — 4-step wizard (dates → room → guest → Pesapal payment), accepts `?room=<slug>` deep link, persists session, supports add-ons (Transfers + Experiences).
- 3 rooms with rates: Riverfront Deluxe $310, Standard River $260, Family $360 (per night, USD).
- 8 add-ons live in Supabase `extras` (Airport Transfer $70, Lake Duluti Canoeing, Local Market, Mountain Bike, Waterfall Excursion, Maji Moto Hot Springs, Live Cooking, River Walks).
- Reviews: 4.9/5 aggregate (240 reviews), 2026 TripAdvisor Travelers' Choice — pulled via `useReviewData`.
- Payments: Pesapal (50% deposit, balance later); cancellation tiers already defined.
- Analytics: `src/lib/analytics.ts` already emits `booking_click`, `whatsapp_click`, `call_click`, `email_click`, `availability_request_started/completed`, `room_view`. Missing: `add_on_selected`, `availability_checked`, `booking_started`, `booking_completed`.
- Contact: WhatsApp link, phone `+255752441443`, email `bookings@…`.
- Existing pages NOT to duplicate: `/`, `/rooms/*`, `/experiences`, `/dining`, `/reviews`, `/lodge`, `/about-us`.

**Differentiators:** riverfront Maasai-inspired architecture, 10-min from Arusha airport (transit-friendly), curated experiences bookable in same flow, real TripAdvisor proof, secure card payments in USD.

**Strongest conversion assets:** Pesapal deposit flow, live availability RPC, TripAdvisor badge, hero river imagery, WhatsApp fallback.

**Weakest points for paid traffic:** homepage is brand-led, not offer-led; no single-scroll page that goes hero → trust → rooms → book; experiences add-on upsell isn't visible until step 2 of wizard.

## Phase 2 — Priority audiences

Prioritize **Safari travelers** (highest intent + AOV: pre/post-safari stay, airport transfer attach) and **Airport transit travelers** (short-stay, high conversion, low decision friction). Leisure secondary; business deprioritized.

## Phase 3 — Strategy

- **URL:** `/stay` (clean, ad-friendly, distinct from `/book` engine and `/` brand page).
- **Positioning:** "Your First & Last Stop in Northern Tanzania — A Riverside Retreat 10 Minutes from Arusha Airport."
- **Primary CTA:** "Check Availability" → deep-links to `/book?step=1` (pre-fills nothing) or `/book?step=1&room=<slug>` from room cards.
- **Secondary CTA:** WhatsApp.
- **Tracking added:** `booking_started`, `booking_completed`, `availability_checked`, `room_selected`, `add_on_selected` (wired into existing `analytics.ts` + `book.tsx` at the right lifecycle points). `whatsapp_click` / `phone_click` already exist.

## Phase 4 — Landing page structure (`/stay`)

Single scroll, minimal nav (logo + phone + WhatsApp only — no full site header to reduce exits):

1. **Hero** — headline, sub, inline availability form (date in/out + guests) that submits straight to `/book?step=2` with the dates.
2. **Trust bar** — 4.9★ · 240+ reviews · TripAdvisor Travelers' Choice 2026 · Secure Pesapal payments · 10 min from JRO.
3. **Why Mtoni** — 3 icons: Riverfront sanctuary / Airport-close / Curated experiences.
4. **Featured rooms** — 3 cards with price-from, "Select Room" → `/book?step=1&room=<slug>`.
5. **Add-on experiences** — 4 most-bookable extras (Airport Transfer, Canoeing, Waterfall, Maji Moto) with prices.
6. **Reviews** — 3 short testimonials + TripAdvisor widget (reuse existing components).
7. **Booking benefits** — 50% deposit · Free cancellation 60+ days · Secure card payment · Instant confirmation.
8. **Final CTA** — repeat availability form + WhatsApp.
9. **Minimal footer** — contact, privacy, terms.

Reuses: `AvailabilityForm`, `TrustBar`, `GuestReviews`/`TrustedByGuestsSection`, `TripadvisorExcellentWidget`, `LocationMap` (optional), room data from `src/lib/rooms.ts`, extras from `listExtras` server fn.

## Phase 5 — Booking integration

- Hero form posts dates+guests to `/book?step=1` with prefilled localStorage state (same `STORAGE_KEY` the wizard uses) so user lands on step 2 with availability already computed.
- Room cards link `/book?step=1&room=<slug>` — book.tsx already reads `?room=`.
- Add-on cards link to `/book?step=2` with a tooltip "Add at checkout."

## Phase 6 — Conversion tracking additions

Extend `src/lib/analytics.ts`:
```ts
trackBookingStarted(location)        // fired on hero "Check Availability" submit
trackAvailabilityChecked(params)     // fired when availability RPC returns
trackRoomSelected(roomSlug, price)   // fired in book.tsx step 2 selection
trackAddOnSelected(slug, qty)        // fired in book.tsx step 3 extras
trackBookingCompleted(params)        // fired on Pesapal return success
```
Wire into `book.tsx` and `booking.return.tsx` at the matching lifecycle points.

## Phase 7 — Performance

- Reuse already-optimized `hero-river-{800,1600}w.webp` with preload.
- Lazy-load below-fold sections (`Reveal` already exists).
- Minimal header on `/stay` only — no journal/navigation noise.
- Self-referencing `<link rel="canonical">` to `https://mtoniriverlodge.com/stay` + LodgingBusiness JSON-LD (reuse root schema).
- `head()` with route-specific title/description/og:image.

## Files I'll create/edit

**Create:**
- `src/routes/stay.tsx` — the landing page.
- `src/components/site/LandingHero.tsx` — hero + inline availability form.
- `src/components/site/LandingHeader.tsx` — minimal header (logo + phone + WhatsApp).
- `src/components/site/LandingRoomCards.tsx` — 3 room cards.
- `src/components/site/LandingExperiences.tsx` — 4 add-on cards.

**Edit:**
- `src/lib/analytics.ts` — add 5 new tracking helpers.
- `src/routes/book.tsx` — fire `room_selected`, `add_on_selected`, `availability_checked`, `booking_started`; accept hero form prefill.
- `src/routes/booking.return.tsx` — fire `booking_completed` on success.
- `src/lib/sitemap-data.ts` + `src/routes/sitemap-pages[.]xml.ts` — include `/stay` (or exclude if user prefers paid-only).

Ready to proceed with this plan?
