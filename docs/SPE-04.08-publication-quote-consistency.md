# SPE-04.08 — Publication & Quote Consistency

**Programme:** StayNas — Pricing & Revenue Management  
**Workstream:** SPE-04 — Deterministic Pricing Resolver  
**Milestone:** SPE-04.08  
**Status:** IMPLEMENTED · UAT DATABASE REGRESSION PASS · CI PENDING  
**Branch:** `feat/spe-04-deterministic-pricing-resolver`  
**PR:** #151 (draft; unmerged)

## 1. Defect found

The resolver first counted eligible latest-publication plans and correctly returned `RATE_PLAN_REQUIRED` when more than one qualified. Its subsequent plan-fetch query nevertheless used `ORDER BY p2.id LIMIT 1` inside a fallback selector. This duplicated selection logic and left an arbitrary UUID-based selection path in the resolver. The second query also did not repeat the exact latest-publication candidate constraint used by the count query.

## 2. Correction

Migration `20261106230000_spe04_08_publication_quote_consistency.sql` replaces the resolver body so that:

- The plan-fetch query repeats the same property, active/published status, room-type assignment, plan effective dates, publication effective dates, explicit-plan selector and latest-publication-number conditions used to count candidates.
- Implicit selection occurs only after the earlier count has established exactly one candidate.
- No UUID/name/creation-order tie-break is used to choose a plan.
- If the selected plan/latest publication cannot be resolved consistently, the resolver returns `NO_ELIGIBLE_RATE_PLAN` rather than continuing with an arbitrary row.
- The resolver reads one publication row and uses its ID, number, version and hash for every nightly evidence record in the result.

This remains database-authoritative; no frontend monetary logic was added.

## 3. UAT evidence

Applied to Nolmark UAT project `hpsryyywolitgeaacpoy` only. Migration history records `spe04_08_publication_quote_consistency` (database-generated version `20261106092825`). No production migration or deployment.

Direct runtime regression against the existing Nolmark-only SPE-04.07 browser fixtures, 10–12 December 2026, two adults:

| Scenario | Result |
|---|---|
| Implicit selection with two eligible published plans | `RATE_PLAN_REQUIRED` |
| Explicit Flexible plan | PASS — USD 111/night × 2 = USD 222; publication ID/hash returned |
| Explicit Advance plan | PASS — USD 144/night × 2 = USD 288; publication ID/hash returned |
| Nightly evidence | PASS — both nights carry the selected plan ID and same publication ID/version/hash |

Database source inspection also confirmed the deployed resolver contains the multiple-plan fail-closed branch, the publication-consistency guard and no `ORDER BY p2.id` selection.

The two pre-existing browser UAT fixtures remain active/published and were not modified. No bookings, inventory, room records, rates, tenant configuration or historical snapshots were changed by this milestone.

## 4. Test limitation

The dedicated pgTAP file `supabase/tests/spe04_08_publication_quote_consistency.test.sql` adds two source-contract assertions (21 assertions total in the copied suite). The UAT project does not have the pgTAP runner installed, so that suite was not executed. GitHub Actions runs for this exact head were not yet returned at report time; CI is therefore pending, not passed.

## 5. Release boundary

- No production migration, deployment, merge or live commercial-rate change.
- PR #151 remains draft and unmerged.
- SPE-04.08 is implementation/UAT-regression complete, pending CI verification.
