## Sprint 3 — Guest CRM & 360° Guest Intelligence

Sprint 2 already delivered the CRM foundation: `guests` table, directory, profile page with tabs (reservations, notes, communications, reviews, timeline), tags, notes, duplicates finder, and CRM dashboard widgets. Sprint 3 builds the "intelligence" layer on top — preferences, smart tag catalogue, relationship metrics, quick actions, richer widgets, experience/payment tabs, and AI-ready summary hooks — without duplicating any existing records.

### Scope (this sprint)

**Schema (single migration)**
- `guest_preferences` (guest_id, key, value, category, source, updated_by) — keyed store for room/bed/dietary/service prefs; unique(guest_id,key).
- `guests` new columns: `birthday date`, `anniversary date`, `marketing_consent bool`, `photo_url text`, `vip_since timestamptz`, `ai_summary text`, `ai_summary_updated_at timestamptz`.
- `guest_metrics` view (per guest): repeat flag, avg_nights, avg_spend, favourite_room_id, favourite_experience, avg_lead_time_days, cancellation_rate, avg_party_size.
- `guest_country_stats` view for dashboard.
- `guest_documents` stub table (guest_id, kind, label, status, meta jsonb) — no uploads wired; RLS staff-only.
- Extend `find_duplicate_guests` untouched. GRANTs + RLS for every new object.

**Server functions (`src/lib/guests.functions.ts` + new `guest-intelligence.functions.ts`)**
- `getGuestPreferences`, `upsertGuestPreference`, `deleteGuestPreference`.
- `getGuestMetrics(id)` — reads `guest_metrics` view.
- `getGuestExperiences(id)` — derives from existing `booking_extras` joined to `extras` (no new experience table).
- `getGuestPayments(id)` — from existing `payment_events` + `bookings`.
- `getDashboardIntelligence()` — VIP arrivals today, birthdays this week, anniversaries this week, top countries, top 20 lifetime guests, acquisition trend (last 12 months).
- `generateGuestSummary(id)` — stub returning deterministic text now; Lovable AI wiring left as TODO comment (design-only per spec).
- `listGuests` gains filters: `countries[]`, `minStays`, `dateRange`, existing tag filter; keeps backward-compatible defaults.

**UI**
- Profile page: add tabs **Experiences**, **Payments**, **Preferences**, **Documents** (empty-state), and a **Quick Actions** toolbar (Create reservation → prefilled `/book`, Add note, Add tag, Send email `mailto:`, Copy details, View invoices, View reviews, Generate summary).
- Profile header: photo/initials, birthday/anniversary chips, marketing-consent badge, VIP-since.
- New `RelationshipStats` card (metrics view).
- `SmartTagPicker`: seed catalogue of tags on first render (idempotent) — VIP, Repeat Guest, Anniversary, Family, Corporate, Photographer, Birdwatcher, Luxury Traveller, Adventure Traveller, Safari Extension, Birthday, High Spender, Referral, Dietary Requirements.
- Directory: country multi-select, min-stays slider, VIP toggle already exists → extend to combined filters; keep URL-driven state (search params) using zodValidator + fallback.
- Admin dashboard: new widgets — Today's VIP Arrivals, Birthdays, Anniversaries, Top Countries, Acquisition Trend (sparkline), Guest Satisfaction (avg review rating last 90d), Recent Reviews (already exists → reuse).

**Event bus integration**
- Timeline server fn augmented to consume `activity_logs` rows tagged with `module='guests'` (Sprint 2+ Event Bus) in addition to existing booking/payment/review derivations. No new writers this sprint beyond `guest.preference_updated`, `guest.tag_added`, `guest.note_added`, `guest.summary_generated`.

**Out of scope**
- Actual document uploads, WhatsApp send UI, real AI generation, loyalty program, campaign engine. Architecture only.

### Technical notes
- No new experience/payment tables — always derive from existing `bookings`, `booking_extras`, `payment_events`, `reviews`. Enforces "never duplicate".
- All new tables get `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated` + `GRANT ALL ... TO service_role`, RLS staff-only via `is_any_staff(auth.uid())`.
- Server fns use `requireSupabaseAuth`; called from `_authenticated` routes only.
- Preferences UI is a simple key/value editor with category dropdown (room, dining, service, accessibility, other).
- Metrics view is `SECURITY INVOKER` and staff-only via table RLS on underlying `guests`/`bookings`.

### Verification
- `bun run build:dev` passes.
- Manual: existing booking flow, existing directory search, existing profile tabs still work.
- New tabs render with empty states for guests with no data.

### Deliverables order
1. Migration (schema + views + grants + RLS).
2. Server functions.
3. UI components + new profile tabs + dashboard widgets.
4. Build verification.
