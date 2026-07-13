
# Sprint 2 — Guest CRM Foundation

Build a Guest CRM as an enrichment layer over the existing `bookings` table. Bookings stay the source of truth for reservations, payments, and reviews; the CRM adds a stable guest identity, notes, tags, and a communications/timeline view on top.

## 1. Data model (backend)

New tables in `public` (all with GRANTs + RLS + `has_any_role`-based staff policies):

- `guests` — canonical guest identity
  - `id`, `email` (citext, unique), `phone_e164`, `full_name`, `country`, `preferred_language`, `nationality`, `time_zone`, `communication_preference` (`email|whatsapp|sms|none`), `avatar_url`, `status` (`new|returning|vip`, derived + overridable), `internal_notes` (short pinned field), `created_at`, `updated_at`.
- `guest_notes` — staff notes with soft delete + edit history
  - `id`, `guest_id`, `author_id`, `body`, `is_deleted`, `deleted_at`, `history` jsonb (array of `{at, author_id, body}`), `created_at`, `updated_at`.
- `guest_tags` — tag catalog (`id`, `slug`, `label`, `color`, `created_by`).
- `guest_tag_assignments` — join (`guest_id`, `tag_id`, `assigned_by`, `assigned_at`), unique.
- `guest_communications` — manual + system entries (`id`, `guest_id`, `booking_id?`, `channel` `email|whatsapp|sms|note|system`, `direction` `in|out|internal`, `subject`, `body`, `occurred_at`, `author_id?`, `meta jsonb`).

Add to existing `bookings`: nullable `guest_id uuid references guests(id)`. Do not remove existing guest_* columns — keep for backward compat.

Backfill migration:
- Group existing `bookings` by lower(email), create one `guests` row per unique email (fall back to phone when email missing), set `full_name` from most recent booking, populate `country`, `first_stay`, `last_stay` derived on read (see below).
- Update `bookings.guest_id` to link.
- Trigger `bookings_link_guest`: on insert/update of `bookings`, upsert a `guests` row by email/phone and set `guest_id`.

Derived aggregates (SQL view or RPC, not stored):
- `guest_stats(guest_id)` → `total_stays`, `total_nights`, `first_stay`, `last_stay`, `lifetime_spend`, `cancelled_count` from `bookings`.
- `guest_directory` view: `guests` LEFT JOIN aggregates + tag array.

Duplicate detection RPC `find_duplicate_guests()`:
- Groups by normalized email, normalized phone, and `soundex(full_name)+country`. Returns candidate clusters with a similarity score. No auto-merge.

RLS policies: staff-only via `has_any_role(auth.uid(), ARRAY['owner','manager','reception','marketing','finance','housekeeping','admin'])`. Column-level exposure enforced in server fns per role (marketing gets contact only, housekeeping gets stay info only, etc.).

## 2. Server functions (`src/lib/guests.functions.ts`)

All `.middleware([requireSupabaseAuth])` with a role-based visibility helper:

- `listGuests({ q, status, tagIds, sort, page, pageSize })` — reads `guest_directory` view; server-side search on name/email/phone/country; returns `{ rows, total }`.
- `getGuest({ id })` — profile: guest row, stats, tags, notes (non-deleted), recent bookings (id, reference, dates, status, total), payments summary, reviews (join by email), communications.
- `getGuestTimeline({ id })` — merges: booking created/confirmed/cancelled events (from `bookings` + status timestamps), payment_events, email_events, whatsapp_alerts, guest_communications, guest_notes. Returns sorted list `{ at, type, title, description, meta }`.
- `upsertGuest`, `updateGuestStatus`, `updateGuestPreferences`.
- `createNote`, `updateNote` (records `history`), `deleteNote` (soft).
- `listTags`, `createTag`, `assignTag`, `unassignTag`.
- `logCommunication({ guestId, channel, direction, subject, body, occurredAt })`.
- `findDuplicateGuests()` — wraps RPC.
- `mergeGuests({ primaryId, mergeIds })` — reassigns bookings/notes/tags/communications to primary, soft-deletes merged rows. Owner/manager only.

Role gating helper: `assertGuestAccess(roles, scope)` where `scope` ∈ `read|contact|stay|payment|write|merge`.

## 3. UI

New route tree under `/_authenticated/admin/guests/`:

- `crm.tsx` — Guest Directory (replaces existing ComingSoon)
- `crm.$id.tsx` — Guest Profile
- `crm.duplicates.tsx` — Duplicate suggestions

Reusable components in `src/components/os/crm/`:
- `GuestCard`, `GuestSummary`, `GuestHeader`, `QuickActions`
- `ReservationList` (reads existing bookings)
- `Timeline`
- `GuestTags` (chips + add/remove popover)
- `NotesPanel` (create, edit-with-history, soft-delete)
- `CommunicationHistory`
- `DirectoryTable` (search, filter, sort, pagination, keyboard nav)
- `DuplicateSuggestionCard`

Directory features: debounced search, filter by status + tags + country, sort by name/last_stay/total_stays/lifetime_spend, page size 25/50/100.

Profile tabs: Overview · Reservations · Payments · Reviews · Experiences · Communications · Timeline · Notes.

## 4. Dashboard integration

Extend `admin/index.tsx` with widgets driven by new server fns:
- Recent Guests (last 14 days)
- Returning Guests (>=2 stays)
- VIP Guests
- Recent Reviews (existing reviews joined to `guests`)
- Upcoming Arrivals (existing bookings, next 7 days) linking to guest profile.

## 5. Permissions

`MODULE_ROLES` update in `src/lib/permissions.ts`:
- `guests.crm`: owner, manager, reception, marketing, housekeeping, finance, admin
- `guests.crm.merge`: owner, manager, admin (used by client to hide merge UI)

Server fns re-check via `assertGuestAccess`; scoped column projection per role.

## 6. Non-functional

- Indexes: `guests(email)`, `guests(phone_e164)`, `guests(status)`, `guest_tag_assignments(tag_id)`, `bookings(guest_id)`, GIN on `guests(full_name gin_trgm_ops)` for fuzzy search.
- All directory reads paginated (server-side), no unbounded selects.
- Accessible tables: proper `<th scope>`, row focus ring, ARIA labels on actions, keyboard shortcut `/` focuses search.
- Activity logging: every write server fn calls existing `logActivity` helper.

## 7. Verification

- Run existing booking flow (create booking on `/book`) → confirm trigger links to a guest row and the guest appears in the directory.
- Existing `bookings` list, `/booking.return`, reviews, and auth flows unchanged.
- `bun run build:dev` passes.
- Smoke Playwright: sign in as staff, open `/admin/guests/crm`, search, open a profile, add a note + tag, verify timeline entry.

## 8. Out of scope for this sprint

Loyalty tiers, gift vouchers, AI recommendations, marketing campaign send, multi-property — data model leaves room (status enum extensible, tags free-form, communications generic) but no UI/logic shipped.
