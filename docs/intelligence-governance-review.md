# Intelligence Governance Review — Sprint 7

Scope: `src/modules/intelligence/**` and the `intelligence_*` tables.
Method: static review of every server module, every write call site, every
role guard, plus the end-to-end simulation harness
(`src/modules/intelligence/simulation`).

## 1. No hidden writes — PASS

- Every intelligence server module reaches the database through the
  request-scoped, RLS-bound client from `requireSupabaseAuth`. There is no
  import of `@/integrations/supabase/client.server` (service role) anywhere
  under `src/modules/intelligence`.
- The only writes outside the `intelligence_*` namespace are in
  `orchestration/executionAdapter.ts`, and all four are visible, reviewable
  artefacts: `ops_tasks` (task + pricing review), `notifications`, and a
  `campaigns` row created with `status: 'draft'`. No rate, reservation, room
  state, guest record or invoice is ever mutated by the core.
- Every adapter write carries a trace bag
  (`intelligence_action_id`, `decision_id`, `adapter`) so the origin of the row
  is provable from the row itself.
- Read surfaces are strictly read-only: `context.server.ts`,
  `forecast.server.ts` (board), `timeline.server.ts`, `health.server.ts`,
  `quality/quality.server.ts` and the whole `simulation/` folder perform no
  writes at all.

## 2. No bypass permissions — PASS

- Read access: `assertIntelRead` → `has_any_role` with `INTEL_READ_ROLES`.
- Governance access: `assertIntelDecide` → `has_any_role` with
  `INTEL_DECIDE_ROLES` (owner, admin, manager) for approve / reject / modify /
  memory curation.
- Critical-risk approvals narrow further to owner and admin
  (`APPROVAL_ROLES` in `actionOrchestrator.ts`).
- Module visibility is filtered per role through `visibleModules()`, applied to
  the decision board, the quality board and every list query.
- No role state is stored outside `public.user_roles`; the core reads roles
  through the existing security-definer role functions only.

## 3. No uncontrolled execution — PASS

- Actions move only along `ALLOWED_TRANSITIONS`; shortcuts such as
  `pending_approval → executing` are rejected by `assertTransition`.
- `requiresApproval(risk, automated)` exempts nothing above low risk, and only
  when a module explicitly marked the action automated.
- `guardExecution` enforces single execution per
  `decision:step:action` execution key, bounded retries, and refuses terminal
  or unapproved actions.
- `assessContextDrift` re-validates the business context before a stale
  approved plan executes.
- Revenue and marketing never execute directly: `pricing.review` creates a
  review task and `campaign.draft` creates a draft, both requiring a human.
- Decision-level approval is additionally forced for revenue and marketing
  domains, high-effort options, and anything carrying a constraint penalty
  (`requiresApprovalFor`).

## 4. All decisions traceable — PASS

Each `intelligence_decisions` row persists the full ranked option set with
per-criterion weights, scores and contributions, the active constraints and
their source (strategic memory / capacity / policy / availability), the
exclusion reason for every rejected option, the evidence bag, assumptions,
uncertainties, risks, reasoning sources, the prediction keys behind it, and the
business context snapshot at evaluation time. Scoring is deterministic and
LLM-free; the optional narration is stored alongside the reasoning and never
alters the ranking. `decided_by`, `decided_at` and `decision_note` record who
decided and why.

## 5. All actions auditable — PASS

- `intelligence_actions` records requester, approver, approval time, risk
  level, adapter, capability, execution key, retry counts and context snapshot.
- `intelligence_executions` records every attempt with request, response,
  external reference and error.
- `intelligence_outcomes` records the target captured **before** execution, the
  baseline, the measured actual, variance, achievement and verification status.
- `intelligence_feedback` and `intelligence_memory` close the loop; memory is
  only promoted through the curation path guarded by `assertIntelDecide`.

## Simulation evidence

`src/modules/intelligence/simulation` drives three scenarios (high demand, low
demand, operational pressure) through the real reasoning path and asserts the
governance expectations above. It is pure and read-only, so running it cannot
contaminate live intelligence data. Results are visible at
`/admin/intelligence/simulation` and enforced in CI by
`simulation/__tests__/simulation.test.ts`.

## Residual risks

1. Quality metrics need production evidence — prediction accuracy and outcome
   achievement stay `null` until predictions are scored and outcomes measured.
2. Adapter-created `campaigns` and `ops_tasks` rows rely on the owning module's
   own RLS for downstream edits; the core only creates them.
3. Competitor pricing and weather are not observed, so demand decisions carry
   that stated uncertainty rather than a modelled one.