# StayNas multi-currency and sales-channel pricing — implementation contract

Status: implementation design approved for execution; not production-certified.

## Product decisions

- Property operating/reporting currency is explicitly configured and is not a price-book currency.
- No platform-wide USD default. A new property must select an operating currency during onboarding.
- A published rate plan or package offer owns its transaction currency.
- Every quote, booking, payment attempt, refund, invoice and immutable pricing snapshot retains the transaction currency.
- No implicit FX conversion and no cross-currency addition, subtraction, comparison or reporting aggregation.
- Consolidated reporting may use an explicitly approved FX source and a recorded rate/date/source snapshot; it must not rewrite historical transaction values.
- Channel identity is part of the server-resolved pricing request. It is not trusted from a client-supplied tenant/property identifier.
- Inventory, room assignment, guest identity and reservation lifecycle remain property-scoped and shared by all sales channels.

## Mtoni channel contracts

### Official direct booking — `/book`

- Preserve the existing official room rates exactly: Standard USD 260, Deluxe USD 310, Family/Group USD 550; Standard/Deluxe extra guest USD 30 where the existing occupancy rules apply.
- Currency remains USD for the currently published direct-booking price contract until an explicit new price publication is approved.
- The direct-booking channel must resolve only direct-booking rate plans and must not expose campaign package prices.

### Escape to Mtoni — `/escape-to-mtoni`

The currently published campaign page identifies these fixed package totals (not per-person prices):

| Offer | Published package total |
| --- | ---: |
| Festive stay / The Mtoni Escape / Christmas at Mtoni / New Year at Mtoni | TZS 1,500,000 |
| Cultural Heritage Centre + Meserani Snake Park | TZS 1,700,000 |
| Lake Duluti Forest Reserve | TZS 1,650,000 |
| Napuru Waterfalls | TZS 1,900,000 |
| Nkweranja Waterfalls + BBQ | TZS 1,900,000 |
| Arusha National Park safari | TZS 2,800,000 |
| Tarangire National Park safari | TZS 3,000,000 |
| Ngorongoro Crater safari | TZS 3,400,000 |

- Campaign page describes the day-escape and safari totals as two nights for two guests sharing a Double/Twin room, combined with the selected experience; they are package totals, not room-only accommodation rates.
- Festive offer describes two nights for two guests sharing a Double/Twin room, with special dining and BBQ evenings included.
- Offer availability is subject to confirmation by reservations.
- The campaign audience is East African residents. Eligibility must be captured as a declared country of residence and confirmed by reservations before a campaign booking is accepted. Do not invent a document list or automated proof standard; the published page currently does not state one.
- Package contents and total must be immutable on the quote/booking snapshot. The booking must preserve the offer code, channel attribution and partner/fulfilment components.
- Safari Jens is the named excursion partner. The approved 5% Nolmark attribution commission must be recorded against eligible attributable sales without fabricating a partner cost split.
- A package must not be represented as an accommodation-only rate plan. Its accommodation and experience components need explicit fulfilment/settlement records, even when only a package total is sold to the guest.

## Required data model

1. `staynas_sales_channels`: property-scoped stable channel ID/code, display name, channel type, active state, guest-facing route, currency policy and eligibility policy version.
2. Rate-plan publication: immutable channel association and currency snapshot. Existing legacy plans remain explicitly unassigned/legacy until mapped; no implicit reassignment.
3. Package catalogue/publication: immutable offer code/version, TZS transaction currency, fixed package total, stay/occupancy contract, inclusions, exclusions, partner fulfilment references, eligibility policy version and effective dates.
4. Quote and reservation: channel ID/code, offer/rate-plan ID and version, transaction currency, price snapshot/hash, attribution metadata and eligibility review state.
5. Finance: retain separate currency ledgers; record partner fulfilment and 5% commission attribution separately from guest booking totals. Do not infer partner settlement amounts from the package total.

## Pricing and runtime invariants

- The resolver must validate the selected channel, property, active publication, currency, effective dates, room assignment, occupancy and full-stay restrictions as one deterministic contract.
- A direct channel request cannot resolve a campaign offer; a campaign request cannot resolve a direct-only rate plan.
- A quote must be revalidated against its exact channel and immutable publication. Changing channel or offer invalidates the quote.
- A channel price currency may differ from property operating/reporting currency. The transaction currency is taken from the selected publication, not from the property or room fallback.
- Legacy room base prices are not a cross-currency fallback when channel publications exist. Any legacy path must remain explicit and currency-consistent.
- Extras, fees, promotions, taxes and payment provider capability must be evaluated in the selected transaction currency. Unsupported combinations fail closed.
- Inventory allocation and cancellation restoration must be atomic and shared across channels; parallel channels cannot oversell the same room.
- Booking source, channel and campaign attribution must be persisted server-side, not accepted as trusted guest input.

## Migration and implementation sequence

1. Remove USD defaults from new property, room and booking currency creation paths; require explicit values and preserve existing historical values.
2. Add property-scoped sales-channel and immutable channel-publication contracts.
3. Extend resolver, discovery, quote, quote revalidation and booking materialization with server-authoritative channel context.
4. Add package offer publication and fulfilment/attribution contracts without treating package totals as accommodation rates.
5. Add Mtoni direct USD price publications matching the existing official room price contract.
6. Add Mtoni Escape to Mtoni TZS package publications matching the live campaign page; add the resident declaration/review state.
7. Integrate both website entry points with the same property inventory and canonical reservation lifecycle.
8. Run migration dry-run, RLS/tenant isolation, resolver, price/currency, package fulfilment, attribution, payment, concurrency and full guest/staff UAT.
9. Only after all gates pass: explicit founder approval for production migration, publication, property activation and deployment.

## Current production facts and release gate

- Mtoni property is currently in `setup`, with property currency USD.
- Legacy room currency is USD; room base prices are USD 260 / 310 / 550 with existing occupancy rules.
- Mtoni currently has zero rate plans, zero active published rate plans, zero publications, zero quotes and zero bookings.
- The existing public-booking resolver currently requires room, rate-plan and publication currency to match the property currency. This must be changed and tested before Mtoni can use TZS package publications while retaining USD direct prices.
- The public booking code is currently an allowlisted UAT/demo flow, not a production Mtoni booking channel. Do not add Mtoni to the allowlist or activate it as a shortcut.
- The live campaign page is currently enquiry-led (WhatsApp/email) and its page source is not present in this repository. Do not claim the campaign page has been integrated or change its live deployment from this repository.
- No production database mutation, migration application, property activation, DNS change, merge or deployment is included in this implementation contract.
