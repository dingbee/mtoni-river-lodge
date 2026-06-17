# Mtoni River Lodge — Custom Booking Engine Plan

## 1. Current-state audit

**Frontend (TanStack Start, no backend yet):**
- Room catalog is hard-coded in `src/lib/rooms.ts` — 3 room types: Riverfront Deluxe, Standard River, Family/Group Room. Total inventory = 24 physical rooms (not yet modeled).
- Booking UX is **inquiry-only**, no real availability or payment:
  - `src/components/site/AvailabilityForm.tsx` — form → builds WhatsApp message → opens wa.me. Stores last 50 inquiries in `localStorage` only.
  - `src/components/site/AvailabilityModal.tsx` — same logic, modal variant.
  - `src/routes/book.tsx` — wraps `AvailabilityForm`.
  - `src/routes/booking-form.tsx` — legacy duplicate.
  - `src/components/site/RoomRate.tsx` — "Reserve" CTA on each room page links to `/book`.
  - Room detail pages: `rooms.riverfront-deluxe.tsx`, `rooms.standard-river.tsx`, `rooms.family-room.tsx`, `rooms.index.tsx`, `pricing.tsx`.
- Pricing is presentational only (no rate logic, no seasons, no taxes).
- Analytics: `src/lib/analytics.ts` already emits `availability_started`, `availability_whatsapp`, `availability_completed`.

**Backend:** Lovable Cloud is **not enabled**. No `src/integrations/supabase/`, no migrations, no edge/server functions exist yet. Everything needs to be provisioned.

## 2. Architecture proposal

```text
Guest                 Public site (TanStack Start)            Lovable Cloud (Supabase)
─────                 ───────────────────────────────         ──────────────────────────
Browse rooms  ──►  /rooms/* (static, hard-coded copy)
Check dates   ──►  AvailabilityWidget
                   └─► serverFn checkAvailability  ─────►   read room_types + inventory_daily + bookings
                                                            (publishable client, anon SELECT policy)
Select room   ──►  /book/[room]?from=&to=&guests=
                   └─► serverFn getQuote           ─────►   rate_plans + season pricing
Guest details ──►  serverFn createBooking         ─────►   INSERT bookings (status=pending)
                                                            DECREMENT inventory_daily atomically
                   └─► serverFn sendBookingEmails ─────►   Resend (guest confirmation + ops alert)
Admin login   ──►  /_authenticated/admin/*        ─────►   has_role('admin') gate
                   ├─ inventory calendar           ─────►   UPDATE inventory_daily (manual)
                   ├─ rates editor                 ─────►   UPDATE rate_plans / seasons
                   ├─ bookings list                ─────►   SELECT/UPDATE bookings (confirm/cancel)
                   └─ blackout dates               ─────►   INSERT inventory_daily overrides
```

**Manual inventory model:** admin sets nightly available room count per room type. Booking decrements; cancellation increments. No channel manager / OTA sync in v1.

## 3. Database schema (new tables)

All in `public` schema with `GRANT`s + RLS per project rules. Roles via separate `user_roles` table + `has_role()` security-definer fn.

| Table | Purpose | Key columns |
|---|---|---|
| `room_types` | Catalog mirror of `src/lib/rooms.ts` | `id`, `slug` (unique), `name`, `base_occupancy`, `max_occupancy`, `total_units` (e.g. Deluxe=X, Standard=Y, Family=Z; sum=24), `active` |
| `rate_plans` | Default + seasonal nightly rates per room type | `id`, `room_type_id`, `name` ("Standard", "Peak"), `currency` (USD), `nightly_rate`, `min_nights`, `valid_from`, `valid_to` |
| `inventory_daily` | One row per (room_type, date) with units available | `room_type_id`, `date`, `units_available`, `units_held`, `is_blackout`, `rate_override` (nullable); PK `(room_type_id, date)` |
| `bookings` | Reservation records | `id`, `reference` (human code MR-XXXX), `room_type_id`, `check_in`, `check_out`, `nights`, `adults`, `children`, `guest_name`, `guest_email`, `guest_phone`, `country`, `special_requests`, `subtotal`, `taxes`, `total`, `currency`, `status` (`pending`/`confirmed`/`cancelled`/`completed`/`no_show`), `payment_status` (`unpaid`/`deposit`/`paid`), `source` (`website`/`whatsapp`/`manual`), `created_at`, `confirmed_at`, `cancelled_at`, `notes` |
| `booking_audit` | Append-only history of status/inventory changes | `booking_id`, `actor`, `action`, `payload jsonb`, `created_at` |
| `user_roles` + `app_role` enum (`admin`,`reservations`,`user`) | Admin gating | per platform standard |

RLS summary:
- `room_types`, `rate_plans`, `inventory_daily`: `SELECT` to `anon` + `authenticated` (public availability search).
- `bookings`: no `anon`/`authenticated` access; all writes via server functions using service role after validation. Admins read via `has_role('admin' | 'reservations')`.
- `user_roles`: `SELECT` to `authenticated` self-row only.

## 4. Server functions (TanStack `createServerFn`, replaces "edge functions")

Per platform rule: **no Supabase Edge Functions for app-internal logic.** Use `createServerFn` in `src/lib/booking.functions.ts` + server-only helpers in `*.server.ts`.

| Function | Auth | Purpose |
|---|---|---|
| `checkAvailability({ checkIn, checkOut, guests })` | public | Returns array of `{ room_type, available, nightly_from, total }` using server publishable client. |
| `getQuote({ roomTypeSlug, checkIn, checkOut, adults, children })` | public | Returns per-night breakdown, subtotal, taxes, total, currency. |
| `createBooking({ ...guest, quoteSignature })` | public + reCAPTCHA/honeypot | Re-validates quote, atomically decrements `inventory_daily` in a SQL function `book_room(...)`, inserts `bookings` (status=pending), triggers emails. |
| `cancelBooking({ reference, email })` | public, email-match | Sets status=cancelled, restores inventory. |
| `adminListBookings(filters)` / `adminUpdateBooking` / `adminSetInventory` / `adminUpsertRatePlan` | `requireSupabaseAuth` + `has_role('admin'\|'reservations')` | Admin ops. |
| `sendBookingEmails(bookingId)` | internal (called from createBooking) | Uses Resend via `RESEND_API_KEY`. |

Atomic inventory: Postgres function `book_room(room_type_id, check_in, check_out, units)` that loops nights `FOR UPDATE` on `inventory_daily`, raises if any night has `units_available < units`, decrements and returns booking-ready data. Called from server fn with `supabaseAdmin` (loaded inside handler).

## 5. Frontend changes

**Replace / upgrade:**
- `AvailabilityForm.tsx` — keep "WhatsApp inquiry" as fallback CTA but make primary action a real booking flow.
- `AvailabilityModal.tsx` — convert to multi-step: dates → room selection → guest details → confirm.
- `book.tsx` — becomes the real funnel host (`/book` step 1 = dates+guests, `/book/[roomType]` step 2 = quote+guest details, `/book/confirmation/[reference]` step 3).
- `booking-form.tsx` — delete (legacy duplicate).
- `RoomRate.tsx` — "Reserve" CTA pre-fills room slug into funnel (`/book?room=riverfront-deluxe`).

**New components:**
- `AvailabilityWidget` (sticky on `/rooms`, `/rooms/*`, home hero).
- `RoomAvailabilityCard` (price-from + "Book" per room in results).
- `BookingSummary` (sticky sidebar with quote breakdown).
- `BookingConfirmation` page with reference + ICS download.

**Admin (under `src/routes/_authenticated/admin/`):**
- `index.tsx` — dashboard (today's arrivals, departures, occupancy %, revenue MTD).
- `inventory.tsx` — month calendar grid per room type; click cell to edit units / blackout / rate override.
- `rates.tsx` — rate plans CRUD with season validity.
- `bookings.tsx` — list with filters (status, date range, room type); detail drawer to confirm / cancel / add notes.
- `room-types.tsx` — toggle active, edit total units.
- `users.tsx` — assign roles.

Auth: enable email/password via Lovable Cloud; first admin seeded via migration after sign-up.

## 6. Secrets required

- `RESEND_API_KEY` (transactional email) — requested via `add_secret` after user confirms.
- `BOOKING_NOTIFICATION_EMAIL` (ops inbox, e.g. reservations@mtoniriverlodge.com).
- (Future) `STRIPE_SECRET_KEY` if deposits are added — out of scope v1.

## 7. GA4 events

Extend `src/lib/analytics.ts`:

| Event | Trigger | Params |
|---|---|---|
| `booking_search` | availability check submitted | `check_in`, `check_out`, `nights`, `guests` |
| `booking_availability_viewed` | results returned | `available_room_types`, `nights` |
| `booking_room_selected` | user clicks Book on a room | `room_type`, `nightly_rate`, `nights`, `total` |
| `booking_guest_details_started` | step 2 opened | `room_type` |
| `booking_submitted` | createBooking succeeds | `room_type`, `total`, `currency`, `nights`, `guests`, `booking_reference` |
| `booking_failed` | server returns error | `reason` |
| `booking_cancelled` | guest self-cancel | `booking_reference` |
| Retain existing | `availability_started`, `availability_whatsapp`, `availability_completed` for WhatsApp fallback |

Map `booking_submitted` to GA4 ecommerce `purchase` (with `transaction_id`, `value`, `currency`, `items`) for revenue reporting + future Google Ads conversion.

## 8. Implementation phases

1. **Enable Lovable Cloud** + auth + `user_roles`/`has_role` scaffolding.
2. **Schema migration** (tables + grants + RLS + `book_room()` SQL fn) + seed `room_types` and initial `rate_plans` from `rooms.ts`.
3. **Server functions** + server publishable client wiring.
4. **Public booking funnel** UI (replaces book.tsx, upgrades modal, keeps WhatsApp fallback).
5. **Email** via Resend.
6. **Admin dashboard** under `_authenticated/admin/`.
7. **GA4 events** + ecommerce purchase mapping.
8. **QA**: oversell prevention test, timezone (Africa/Dar_es_Salaam) handling, cancellation restore, RLS scan.

## 9. Open questions for you

- Exact unit split across the 24 rooms per room type (e.g. how many Deluxe / Standard / Family)?
- Currency: USD only, or also TZS / EUR?
- Take deposits at booking, or confirm-on-payment-on-arrival? (Affects Stripe scope.)
- Cancellation policy text + auto-refund rules?
- Admin emails to seed as initial admins.
- Should WhatsApp inquiry stay as a parallel path, or be removed once real booking is live?
