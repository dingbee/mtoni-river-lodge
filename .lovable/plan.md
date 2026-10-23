# StayNas booking audit (read-only) and safe path for the festive catalogue

No files, database, or deployments were changed. Findings come from reading code and migrations only. No live data was queried.

## 1. Which project this is
- This is the StayNas / Mtoni OS project. It holds the booking engine, Pesapal, the OS and email. It is not the separate website-only Mtoni project.
- The preview and the published app use the same single backend instance. **That database is production. Do not treat it as safe for writes**, and that includes seed or test data.

## 2. Booking flow: evidence
| Area | File / function | What it does |
|---|---|---|
| Booking UI | `src/routes/book.tsx` (1,020 lines) | The wizard. Loads rooms and extras together, creates and releases holds, then calls `createBooking`. It also shows a price breakdown on the page through `buildPriceBreakdownFromConfig`. |
| Legacy URL | `src/routes/booking-form.tsx` | Redirect only. |
| Availability | `booking.functions.ts` → `checkAvailability` | Uses the public client and the `get_room_availability` RPC. Results are sorted by `base_price`. |
| Extras | `booking.functions.ts` → `listExtras` | Reads `extras` where `active`. The category is **hardcoded**: the `airport-transfer` slug is "transfers" and everything else is "experiences". There is no schedule, capacity or bundle concept. |
| Reservation | `booking.functions.ts` → `createBooking` | Uses the `create_booking` RPC (holds introduced in migration `20260717171226`), passing `_extras: [{slug, quantity}]`, `_hold_id` and `_session_id`. It then does a separate admin write for `visit_purpose` and sends the `booking-received` email, which is best effort. |
| Line items | `booking_extras` table (quantity, unit_price, line_total), read in `admin.functions.ts` | The server prices each line inside the RPC. |
| Holds | `availability.functions.ts` → create/release/get hold, plus staff `listActiveHolds`, `releaseHoldStaff` and `reassignBookingRoom`; `expire_booking_holds` | Holds are per room and per date. |
| Currency | `rooms.currency`, `extras.currency`, `bookings.currency`; `Intl` formatting in `book.tsx` | There is **no currency conversion**. Each record carries one currency, and payment finalisation falls back to USD. Rooms and extras could mix currencies, and nothing guards against that. |
| Payment start | `payments.functions.ts` → `initiatePayment` | Checks the booking reference and email, and blocks bookings already paid. It charges **only `deposit_amount`**. It builds a merchant reference and sends the guest back to `/booking/return`. |
| Pesapal | `pesapal.server.ts` (token, `ensureIpn`, `submitPesapalOrder`, status lookup, `classifyStatus`) | Talks to the Pesapal API. |
| Webhook | `src/routes/api/public/pesapal.ipn.ts` | Logs every notification to `payment_events`, then calls `verifyAndFinalizePayment`. It does not trust the notification itself; it re-checks the status with Pesapal. |
| Finalise | `payment-finalize.server.ts` → `verifyAndFinalizePayment` | Exact cent match against the deposit and a currency check. A mismatch is recorded as `payment_mismatch`. Success creates the invoice number, sets `confirmed_at` and sends the email. A booking that is already paid is skipped, so repeats are safe. |
| Return page | `booking.return.tsx`, `getPaymentStatusByReference` | Asks Pesapal for the status and shows it. |
| Cancellation | `admin.functions.ts` → `updateBookingStatus` | Staff only. Sets `status` and `cancelled_at`. **No refund through Pesapal, and no adjustment for extras or experiences.** |
| Staff fulfilment | `admin.bookings` route, `front-desk`, `operations` and `operations-tasks` functions (`ops_tasks`) | Run by room and booking. Nothing schedules or assigns a booked experience. |

## 3. Existing tests
- The only booking test is the Python end-to-end script `tests/e2e/booking_flow.py`.
- There are **no unit tests** for `createBooking`, extras pricing, holds, `initiatePayment`, `classifyStatus`, deposit matching or cancellation.
- The email pipeline tests (`src/lib/email/__tests__`) cover sending only.

## 4. Gaps and risks
1. Extras have no schedule, time slot, capacity, minimum or maximum guests, festive date window, or bundle/package link.
2. The transfers/experiences split is hardcoded in code, not stored as data.
3. Pricing is split. The page computes a breakdown, and the database computes the authoritative total. There is no shared test to keep the two in sync.
4. Currency is per record with no consistency guard. There is no TZS/USD rule.
5. Only the deposit is paid online. How the balance and extras are collected is not modelled.
6. Cancelling releases nothing: no capacity, no refund, no change to extras.
7. Booked experiences generate no staff tasks.
8. `booking_holds` has an anon policy, "Anyone reads by id", with `USING (true)`. Despite its comment, **any visitor can read all holds**. This is a security finding to confirm against the live policies.
9. The `visit_purpose` write runs after the RPC and uses the admin client. If it fails, the error is swallowed.

## 5. Safe development-only approach (proposed, not started)
1. **Isolate first.** Create a Lovable draft, which has its own isolated backend, or a separate dev backend. Never seed the shared production instance. Confirm isolation before any migration runs.
2. **Schema, additive only.** Keep `extras` and `booking_extras` as they are, and add new tables beside them:
   - `catalogue_items`: festive window, category stored as data, currency, pricing unit, active flag.
   - `experience_sessions`: date, start time, capacity, cutoff.
   - `session_reservations`: links to `booking_extras`, with seats and a hold status.
   - `catalogue_bundles` and `bundle_components`.
   - A fulfilment link to `ops_tasks`.
   - Row-level security: public can read active items; staff can write.
3. **Booking engine.** Add a new RPC, for example `create_booking_v2`, that checks capacity inside the same transaction and creates a seat hold at the same time as the room hold. `create_booking` stays as it is until the new one has been tested.
4. **Tests first.** Before the first migration, add unit tests for:
   - extras line totals for each pricing unit
   - the deposit calculation
   - the cent-exact deposit match and `classifyStatus`
   - capacity running out (oversell)
   - bundle expansion
   - cancellation releasing seats
5. **Currency.** Decide one sell currency per property, or one per booking, and enforce it in the RPC.
6. **Cancellation and fulfilment.** On cancel, release seats and close the linked tasks. Refunds stay manual and are logged; there is no automatic Pesapal refund.
7. **Promote.** Show the draft, get approval, then apply the same migrations to production once. No catalogue data is added to production until the festive prices are confirmed.

## Open questions before any build
- Festive items, prices, dates, capacities and bundles: please send the actual catalogue. None was invented.
- Sell currency: USD, TZS, or both?
- Are experiences paid in the deposit, at the lodge, or in full online?
