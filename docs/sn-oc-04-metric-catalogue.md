# SN-OC-04 — Operational Intelligence Metric Catalogue

**Status:** implementation contract / UAT baseline  
**Scope:** property-scoped Concierge and omnichannel operational intelligence  
**Source-of-truth rule:** this catalogue reports only persisted, traceable source records. Missing evidence is `unavailable`, never a synthetic zero.

## Tenant and environment boundary

The approved UAT tenant is Nolmark CDMA (`f44ff48a-5449-4464-b0cb-83295fadb468`), timezone `Africa/Dar_es_Salaam`, currency `TZS`. The shared Supabase project contains other tenant data. UAT application fixtures may be scoped to this tenant, but schema migrations must be verified against an isolated database before any shared-project application. No production promotion is authorized.

## Verified source contracts

| Domain | Source | Verified fields / constraints | Limitation |
|---|---|---|---|
| Sessions | `ai_concierge_sessions` | `id, property_id, channel, created_at, last_active_at, escalated`; property FK and unique (id, property_id) | No explicit resolved/closed timestamp verified |
| Legacy messages | `ai_concierge_messages` | `session_id, role, created_at, latency_ms, source_omnichannel_message_id`; roles user/assistant/system | Do not use for provider delivery; role alone does not distinguish human vs AI |
| Omnichannel messages | `ai_omnichannel_messages` | `property_id, session_id, channel, direction, actor_type, message_type, status, occurred_at, created_at`; idempotent provider/client identifiers | Use only non-event inbound guest/provider and outbound assistant/staff messages; exclude system/provider events |
| Delivery | `ai_omnichannel_delivery_events` | Provider event ID, message, type, occurred/received timestamps | Delivery is not guest response or booking conversion |
| Dispatch | `ai_communication_dispatch_attempts` | Provider, channel, approval, attempt status and timestamps | Dispatch acceptance is not delivery |
| Leads | `ai_concierge_leads` | Property and session linkage, status, consent evidence, idempotency key | Lead status `converted` is not a booking proof |
| Concierge attribution | `ai_concierge_attributions` | Session, optional booking ID, conversion type, metadata, created_at | Booking click and assisted/direct attribution labels alone are not proof of a confirmed booking |
| Campaign attribution | `campaign_attribution` | Property, campaign, optional booking, session key, event type, source/medium/referrer, UTM campaign/content/term, occurred_at; unique event key support | UTM source/medium/content may be carried in metadata; verify event lineage before joining to lead/session |
| Booking | `bookings` | Property, booking ID, status, payment status, confirmed/cancelled timestamps, total, currency, paid amount, check-in/out | Booked revenue and realized revenue must be separate; use finance ledger for settled/refunded realization |
| Escalations | `ai_escalations` joined to session | Session linkage, reason, priority, status, assigned_to, acknowledged_at, resolved_at, created_at, updated_at | Current durable schema lacks complete assignment/reopen event history and SLA policy snapshots |
| Knowledge | `knowledge_documents`, `knowledge_document_versions`, `knowledge_chunks` | Property ownership, published/draft/archived status, current version, chunk version | Document/chunk existence does not prove retrieval or answer grounding |
| Retrieval | `ai_knowledge_search_log` | Property, query, result_count, matched_source_ids, confidence, created_at | No verified FK to Concierge session/message or generated answer; query text should not be exposed in aggregate APIs |
| Feedback | `ai_concierge_feedback` | Session, optional message, rating, comment, created_at | Guest feedback is a perception signal, not factual correctness ground truth |

## Metric definitions

### Lead and conversion

| Metric | Definition | Authoritative calculation |
|---|---|---|
| Leads generated | Distinct consented lead records created in period | Count distinct `ai_concierge_leads.id` by property and created_at |
| Qualified leads | Distinct leads with explicit qualified status or documented qualification evidence | Count qualified lead records; do not infer from intent score alone |
| Confirmed booking conversions | Distinct attributed bookings with authoritative confirmed status and confirmed_at | Join attribution to `bookings` by booking_id and property_id; require confirmed status and non-null confirmed_at |
| Completed stays | Distinct confirmed bookings with verified completed-stay lifecycle evidence | Do not infer completion solely from check_out date; require authoritative checkout/completion evidence |
| Lead-to-booking rate | Confirmed attributed bookings / eligible distinct leads | Cohort leads by lead creation date; deduplicate booking and lead IDs |
| Booking-click rate | Booking clicks / eligible sessions or visitors | Engagement metric only; never label conversion |
| Booked revenue | Sum booking total for verified confirmed bookings, net of cancellation treatment | Use `bookings.total` and `bookings.currency`, grouped by property currency |
| Realized revenue | Settled amount net of posted refunds/reversals | Use authoritative finance/payment ledger; exclude unposted and pending amounts |
| Attribution coverage | Eligible leads with traceable source touch / eligible distinct leads | Report denominator and missing-source count |
| Time to conversion | Confirmed booking timestamp minus first eligible lead timestamp | Require same property and verified linkage |

First-touch, last-touch and conversion-touch must preserve original event timestamps and consent eligibility. No backfill may invent absent source data. Cross-device identity matching requires verified identity links and cannot be inferred from names or email similarity.

### Concierge operations

| Metric | Definition | Evidence |
|---|---|---|
| Conversations | Distinct property sessions created in period | `ai_concierge_sessions` |
| Active conversations | Sessions with no verified closure and recent activity | Until closure event exists, report as activity-recency proxy, explicitly labelled |
| New conversations | Distinct sessions created in period | Session created_at |
| AI-handled / human-assisted | Distinct sessions with corresponding outbound actor types | `ai_omnichannel_messages.actor_type`; do not infer from legacy role |
| Escalated conversations | Distinct sessions with linked escalation records | `ai_escalations` joined by session_id |
| Guest satisfaction | Positive guest ratings / all valid ratings | `ai_concierge_feedback`; expose response count and rating mapping |
| Knowledge retrieval frequency | Retrieval rows and source-document references | `ai_knowledge_search_log.matched_source_ids` |
| Knowledge-supported answer rate | Answer messages with traceable retrieval evidence / eligible answer messages | Unavailable until retrieval-to-message evidence linkage is present |

### Response and resolution

Incoming message: `direction='inbound'`, `actor_type='guest'`, `message_type<>'event'`. Valid response: `direction='outbound'`, `actor_type IN ('assistant','staff')`, `message_type<>'event'`. System/provider events, webhook retries and duplicate provider/client message IDs are excluded.

- First response: first valid outbound message after the first eligible inbound message in the conversation.
- Subsequent response: each valid outbound response after the preceding eligible inbound message, using a deterministic chronological pairing contract.
- AI and human response times: split by outbound actor_type.
- Automated acknowledgements: assistant-originated content counts only when it is a substantive guest-facing response; templated transport receipts/system events do not count. If the source contract cannot distinguish acknowledgement from substantive answer, expose the limitation rather than guessing.
- Unanswered conversations: retain as unanswered; do not drop from denominator.
- Resolution time, first-contact resolution and reopen rate: unavailable until explicit resolution/reopen lifecycle events are persisted. Session last_active_at is not a resolution timestamp.
- Timezone: persist/compare UTC instants; bucket display dates using the property's configured timezone. Percentiles use continuous percentile calculation over eligible completed response intervals.

### Escalation SLA

Current `ai_escalations` provides creation, assignment target, acknowledgement timestamp, resolved timestamp and current status. It does not yet provide immutable assignment/reassignment/in-progress/reopen event history or an SLA policy snapshot. Therefore assignment latency, reopen rate, business-hours SLA compliance and historical policy-correct breach calculations remain unavailable until those durable contracts are added. Current status may support open/assigned/resolved counts only, with explicit status mapping.

### Knowledge and feedback

- Published/active documents: count property-owned documents with status `published`.
- Current chunks: count chunks where chunk.version = document.current_version and property IDs match.
- Retrieval frequency/failure: search log count, result_count=0, and matched source IDs.
- Freshness: use source_updated_at/review_due_at and document current version.
- Guest feedback: aggregate valid ratings and negative-feedback counts; never equate ratings/confidence with factual correctness.
- Factual accuracy: unavailable absent a human-labelled evaluation dataset, versioned rubric and reproducible evaluation run.
- Correction traceability: use document version history; link to disputed answer only where source message and retrieval evidence are explicitly connected.

## Completeness and UI rules

Each API response must include `period_start`, `period_end`, `timezone`, `generated_at`, `source_status`, and metric-level `available`/ `reason_unavailable` metadata. An empty, fully queried source is zero; missing schema, missing permission, incomplete event coverage or unavailable lineage is unavailable. Do not collapse these states.

## Security and performance

- Derive active property on the server and authorize the role before every query/export.
- Every cross-table join includes property identity; where child tables lack property_id, join through a session whose property_id is already authorized.
- Founder aggregate access must use founder authorization, not tenant role bypass.
- Never return raw message bodies, guest identifiers, provider payloads, credentials or raw knowledge queries in aggregate responses.
- Use bounded date windows and indexed property/time predicates. Avoid materializing all session IDs into client-visible requests.
- Exports repeat server-side authorization and apply the same property/time constraints as dashboard queries.
- No cross-tenant aggregates for tenant users.

## UAT baseline — Nolmark CDMA

Read-only scoped counts at inspection time:
- Concierge sessions: 0
- Concierge leads: 0
- Escalations: 0 (joined through property-owned sessions)
- Knowledge documents/chunks/search logs: 0
- Campaign attribution events: 0
- Bookings: 4

These counts are a baseline, not evidence of zero historical conversion. The four booking records currently group as: 1 checked-in/paid USD 1,320; 1 completed/unpaid USD 120; 2 pending/unpaid USD 528. All four stored booking currencies are USD although the property currency is TZS. This is a material currency-integrity discrepancy: do not aggregate or display these totals as TZS, do not convert them using an assumed FX rate, and keep attributed revenue unavailable until booking-currency provenance and authoritative finance postings/reversals are reconciled. A completed-but-unpaid booking is not realized revenue. No synthetic activity has been inserted.
