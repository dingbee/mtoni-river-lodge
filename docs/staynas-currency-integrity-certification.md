# StayNas currency integrity — audit, repair and certification

Date: 2026-11-20 · Branch: `claude/staynas-currency-integrity-xr3zft`

## Verdict

**Not yet CLOSED.** All identified P0/P1 defects are fixed in code and in one new migration, and the
fixes are verified locally end to end: the migration ran against a full replay of all 292 repository
migrations on PostgreSQL 16, with pgTAP, vitest, `tsc` and a production build. **Production is not
certified.** The migration has not been applied to the production Supabase project, the app is not
deployed, and the production Nolmark CDMA records were not inspected. This session had no production
database or Vercel credentials (see *Blocked*).

## How the incident happened (reproduced)

Reproduced on the migration-seeded `nolmark-cdma-staynas` property. Evidence comes from `scripts/ci/currency-integrity/before-fix-evidence.sql`, run on the unfixed schema.

1. **The currency control fails.** `staynas_update_property_currency` (SECURITY INVOKER, `20261119123000/130000`) also sets `updated_at`, but `authenticated` only holds `UPDATE(currency)`. Result: `ERROR: permission denied for table staynas_properties`.
2. If the currency did change (for example through the earlier SECURITY DEFINER version), every
   USD rate plan became impossible to suspend, archive or edit. `validate_staynas_rate_plan_context` and the daily/seasonal guards reject *any* update while plan currency ≠ property currency. The old USD plan therefore kept selling.
3. The guest page then offered **USD 80 and TZS 125,000 side by side**. Discovery listed the USD plan, and its quote failed with `CURRENCY_MISMATCH`, so choosing it broke the booking.
4. With a single TZS plan, priced availability returned `currency=USD` next to `nightly_total=125000`, because the row was labelled with the legacy `rooms.currency`. The page showed **"$125,000"**.
5. The booking was **persisted as USD 125,000** while its immutable pricing snapshot said TZS (`B7`). Payments, refunds and folio charges inherit `bookings.currency`, so they would also have been recorded in USD.

## Defects, root causes and fixes

| # | Sev | Defect / root cause | Fix (file / DB object) | Verification |
|---|-----|---------------------|------------------------|--------------|
| D1 | P0 | Currency RPC writes `updated_at` without column privilege, so a manager's currency change fails | `staynas_update_property_currency` updates only `currency` (the trigger maintains `updated_at`) | pgTAP 1–3; Test A1 |
| D2 | P0 | Rate-plan guards block suspending/archiving a plan left in the old currency, so stale plans stay published | Context guard enforces currency only on insert, publish or commercial change; daily/seasonal guards split into INSERT + UPDATE…WHEN | pgTAP 4–9; Test A2–A3 |
| D3 | P0 | Resolver/discovery sell plans whose currency ≠ property currency (SPE-04 "independent transaction currency", which the DB guards and quote service never supported) | `resolve_staynas_published_room_pricing` and `discover_staynas_public_rate_plans` sell only property-currency plans; an explicit stale plan returns `CURRENCY_MISMATCH` with an actionable message | pgTAP 12–13 |
| D4 | P0 | Availability row currency = legacy `rooms.currency`, not the quote currency (the "$125,000" display) | `get_staynas_room_availability_priced` returns the quote currency and nulls a foreign-currency legacy price; `mapPublicAvailability` (TS) enforces amount+currency pairing | pgTAP 10–11; `public-availability.test.ts` |
| D5 | P0 | `create_booking_for_property` persists `bookings.currency` from `rooms.currency` (silent reinterpretation) | Persists the quote currency, asserts it equals the property currency and every nightly currency | pgTAP 19–21, 28; Test A7–A8 |
| D6 | P0 | Legacy `create_booking` overloads price from `rooms.base_price/currency` and are executable by `anon`/`authenticated` | EXECUTE revoked from browser roles (service_role kept) | pgTAP 31 |
| D7 | P1 | Room Catalogue save omits price fields and the server defaults them, so every save reset `base_price` to 0 and `included_guests` to 2 | `savePlatformRoomType` preserves stored values; a re-entered price is stamped in the property currency, and an untouched price keeps its recorded currency | tsc/build; code review |
| D8 | P1 | Rate-plan admin offered a free-text "guest transaction currency" the DB rejects; season/daily badges showed a different currency than stored | Currency read-only = property currency; stale plans and rates flagged for re-entry; server rejects a mismatching currency | `public-booking-channel.server.test.ts` |
| D9 | P1 | Production schema drift: `bookings.tax_addition/tax_breakdown` exist in production types but no migration creates them, so a clean DB cannot create bookings | Idempotent `ADD COLUMN IF NOT EXISTS` (no-op in production) | Full replay + pgTAP |
| D10 | P1 | Guest amounts rounded to whole units (`maximumFractionDigits: 0`), so USD 125.50 displayed as "$126" | `src/lib/money.ts` `formatMoney` uses ISO minor units; applied to guest, booking, rooms and invoice views | `money.test.ts` |
| D11 | P1 | Analytics/forecast/AI revenue summed bookings across currencies and properties and hardcoded "$"/USD fallbacks | Revenue metrics scoped to the active property and its currency; other currencies reported separately, never merged | tsc/build; code review |
| D12 | P1 | Property switch kept cached queries; UI preferred a localStorage property over the server's active property | Invalidate all queries on switch/currency change; server active property is authoritative | code review |
| D13 | P1 | Public `/rooms` catalogue filtered `rooms.currency = channel currency` (rooms vanish after a switch); the API mapped a null price to 0 | No currency filter; indicative price only in channel currency; null stays null | tsc/build |
| D14 | P1 | Pesapal initiation fell back to `"USD"` when the booking currency was missing; the `/book` channel blocked on legacy room currency | No fallback (hard error); channel compares quote currency and requires channel currency = property currency | `public-booking-channel.server.test.ts` |
| D15 | P2 | Float summation in finance totals | `totalsByCurrency` (BigInt minor units) behind `sumCurrency/moneyByCurrency` | `finance-currency.test.ts`, `money.test.ts` |

Historical records are never rewritten. `staynas_currency_integrity_findings(property_id)` is a new,
read-only report that classifies stale rate plans, overrides, room prices, extras, fees, taxes,
promotions and channels, plus reservations whose currency label disagrees with their pricing snapshot,
and folio/payment rows in another currency. Verified non-destructive: record checksums are identical
before and after the migration, and re-applying it is a no-op.

## Certification matrix

| Area | Status | Evidence |
|------|--------|----------|
| Property configuration | PASS (local) | pgTAP 1–3, Test A1: RPC sets TZS, audit USD→TZS |
| Room rates | PASS (local) | Test A3: plan TZS 125,000, publication #2 TZS |
| Booking API | PASS (local) | Test A4: `currency=TZS nightly_total=125000 quote_ccy=TZS` |
| Guest booking page | PASS (unit) / NOT TESTED (browser) | Mapping unit tests; page not rendered against live data |
| Booking submission | PASS (local) | Test A7 `ok=true currency=TZS total=125000.00` |
| Reservation database | PASS (local) | Test A8: booking TZS 125,000, snapshot TZS, night TZS 125,000 |
| Guest folio | PASS (by construction) | `pms_post_folio_charge` validates against `bookings.currency`, now correct; not exercised |
| Payments | PASS (local) | pgTAP 22–24: TZS 50,000 payment, balance TZS 75,000 |
| Refunds | PASS (local) | pgTAP 25, 27: refund −TZS 20,000 |
| Cancellation | PASS (local) | pgTAP 26, 28: snapshot preserved |
| Analytics | PASS (build/type) / NOT TESTED (runtime) | Currency-partitioned code; no runtime data test |
| Property isolation | PASS (local) | pgTAP 14–16, 18: KES property isolated, cross-property plan/quote rejected |
| Currency conversion (Test C) | N/A | No property-level FX exists; mixing is rejected (`addMoney`) |
| Automated tests | PASS | vitest 88 files / 593 tests; pgTAP 30/35 files, with the 5 failures present before this work and unrelated; new suite 32/32; `tsc` 0 errors; `vite build` OK |
| Deployment | BLOCKED | See below |

## Blocked: requires an authorised operator

1. **Apply `supabase/migrations/20261120120000_staynas_currency_integrity.sql` to production**
   (project `hpsryyywolitgeaacpoy`). Before applying, diff the production definitions of the six replaced functions
   (`pg_get_functiondef`) against the repository: the migration replaces them with repository versions plus fixes.
2. **Run `select * from staynas_currency_integrity_findings('<Nolmark CDMA property id>')`** as a
   manager or service role. Re-price or suspend the blocking items (for example the migration-seeded USD extras).
   Have finance review every `booking` / `payment_event` row reported for reconciliation. Do not edit those records automatically.
3. **Deploy the application build** through the normal Lovable/Vercel pipeline. Then retest the live flow:
   nolmarkcdma.staynas.com, 1 night, 2 adults, TZS 125,000, then the persisted booking.
4. **Product decision:** this change retires SPE-04's "guest transaction currency independent of the property
   currency". The database never supported it. Multi-currency selling would need an explicit design with recorded conversion.

## Known remaining items (not currency P0/P1)

- `bookings` and `rooms` money columns are `numeric(10,2)`, with a maximum of 99,999,999.99 per booking (≈ USD 38k in TZS).
  Widening needs a planned migration.
- `routeTree.gen.ts` is committed with non-text bytes (`tsc` fails until `vite build` regenerates it).
- Migration `20261109110948` has `BEGIN` without `COMMIT`. `20261111110000` depends on an unapplied review migration.
- Marketing campaign budgets default to `"USD"`.
- Guest CRM "lifetime spend" is shown with "$".

## Re-running the evidence

```
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=… DB=staynas_currency_check scripts/ci/currency-integrity/run.sh
```
pgTAP: `supabase test db` (includes `supabase/tests/staynas_currency_integrity.test.sql`).
