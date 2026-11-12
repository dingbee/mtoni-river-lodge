# StayNas NSC — Notification Service Consolidation Sprint

**Workstream:** NSC-01 to NSC-05  
**Audit baseline:** `main` repository snapshot inspected on 2026-11-12  
**Implementation branch:** `feat/nsc-platform-notification-service`  
**Scope:** Property-operational staff notifications. Commercial-founder alerts and guest communications remain separate contracts.

## Sprint acceptance contract

A notification is certified only when a real business event is persisted once, associated with its owning organisation and property, resolved to authorized recipients for that same property, delivered through the configured channel, visible to the intended recipient, acknowledged independently of transport processing, and auditable through escalation and resolution.

The following are not equivalent and must remain separate:
- domain event persistence;
- guest communication queue processing;
- staff notification delivery;
- recipient acknowledgement;
- business-event resolution.

## NSC-01 — Current route inventory

| Producer / business source | Trigger or event path | Queue / persistence | Recipient resolution | Worker / transport | User surface | Baseline finding |
|---|---|---|---|---|---|---|
| Booking creation | `handle_booking_insert()` AFTER INSERT on `bookings` | `pending_notifications` | Guest booking contact for outbound confirmation; no staff recipient resolver found in this path | `POST /api/public/ops/drain` | Guest email; staff global panel currently reads this queue too | Guest communication queue is incorrectly reused as a staff notification source |
| Booking status / payment status | `staynas_log_booking_lifecycle()` trigger in `20261104150000_staynas_booking_lifecycle_controls.sql` | `pending_notifications` | Guest booking contact | `/api/public/ops/drain` | Guest email and global panel | `processed_at` means queue work processed, not staff read/acknowledged |
| Guest request lifecycle | `staynas_queue_guest_request_notification()` trigger on `staynas_guest_requests` | `pending_notifications` | Guest contact; property and booking are checked by the worker | `/api/public/ops/drain`, property-configured Resend sender and consent checks | Guest email / guest request journey | Guest communications contract; do not merge into staff delivery |
| Housekeeping task / room / inspection / exception | Triggers on `ops_tasks`, `room_states`, `housekeeping_inspections`, and housekeeping exceptions call `housekeeping_record_event()` | `housekeeping_events` and `housekeeping_notifications` | Assignee plus supervisor roles | Database function writes per-recipient rows; Supabase Realtime invalidates views | Housekeeping notification tab; OS notification panel also reads this table | Recipient table is deduplicated per recipient/event, but supervisor lookup uses global `user_roles` rather than the event property's active `staynas_property_members` |
| Maintenance | Maintenance exception in Housekeeping creates / links an `ops_tasks` record and emits `maintenance_escalated` | Housekeeping event + notification stream | Housekeeping assignee / global supervisor roles | Housekeeping event function / Realtime | Housekeeping and Operations surfaces | No independent property-scoped maintenance recipient contract found |
| Front desk / check-in | Legacy check-in completion trigger inserts into `notifications` | `notifications` | Role-targeted reception notification | No general delivery worker confirmed | Admin automation Notification Centre | Legacy role-based route; property scope is not represented in the base table |
| Concierge escalation | AI concierge escalation trigger creates an `ops_tasks` row and inserts `notifications` | `notifications` | Role-based staff selection in the escalation function | In-app insert; no shared operational dispatcher confirmed | Admin guest messages / automation notifications | Separate producer, uses generic notification table; property scoping must be verified in trigger implementation |
| Automation workflows | `publishEvent()` emits in-memory `eventBus`, persists `activity_logs`, then calls `dispatchEvent()`; `notify_staff` action inserts `notifications` | `activity_logs`, `workflow_runs`, `workflow_run_steps`, `notifications` | Workflow-configured role; no mandatory property resolver in action contract | Automation server function; channel delivery workers are not evidenced by this path | `/admin/automation/notifications` | Durable event log is not a notification queue; workflow notification writes lack an enforced property scope |
| Pesapal payment IPN / finalization | `/api/public/pesapal/ipn` records raw `payment_events`; finalizer updates booking payment state | `payment_events`, booking lifecycle queue | Guest is addressed by existing payment/booking flow; no operational finance recipient route found in inspected path | Payment finalizer and guest email path | Payment status / guest email | Payment audit exists; operational staff notification is not proven |
| Operational tasks | `createOpsTask` and task updates use `ops_tasks`; housekeeping category has dedicated triggers | `ops_tasks`; housekeeping events only for housekeeping category | Active-property task list and assignee; no generic task notification resolver found | No general operations notification worker found | Operations task views | Non-housekeeping maintenance / transport / concierge / F&B task events are not demonstrably connected to staff notifications |
| Room inventory / sellable availability | Room state and booking inventory integrations update room/availability state | Domain tables / availability RPCs | No notification recipient resolver found | No notification worker found | Room Board / Reservations | Inventory-impacting state changes are not demonstrably routed to an operational notification service |
| Commercial subscription / invoices / payments | Commercial ledger and notification functions | `commercial_financial_notifications`, `commercial_founder_notifications`, audit tables | Founder / commercial account contact contracts | Commercial email outbox and founder alert sync | Founder Control Centre and `/founder/notifications` | Specialized commercial pipeline; preserve its separate authorization and delivery contract |
| Guest Concierge communications | AI concierge guest notification / channel pipeline | Guest communication and escalation tables | Guest/channel-specific | Configured email / WhatsApp providers | Guest conversation / portal | Guest-facing communication contract; preserve separately |

### Existing notification surfaces

1. Global OS bell: `NotificationsPanel` → `useNotifications()`; currently merges `pending_notifications` with `housekeeping_notifications`.
2. Admin automation centre: `/admin/automation/notifications` → `listMyNotifications()` / `markNotificationRead()` → generic `notifications`.
3. Housekeeping centre: `/admin/operations/housekeeping` → `listHousekeepingNotifications()` / `markHousekeepingNotificationRead()`.
4. Founder commercial alerts: `/founder/notifications`; acknowledge and resolve lifecycle.
5. Founder commercial outbox: Founder dashboard; provider delivery status.
6. Guest communication: booking and guest-request email, guest portal status, concierge channels.

## NSC-02 — Initial architecture and security findings

| Control | Baseline result | Evidence / consequence |
|---|---|---|
| Tenant / organisation isolation | **Fail / incomplete** | Base `notifications` and `pending_notifications` schemas have no organisation/property scope. Housekeeping supervisor recipients are selected from global `user_roles`. |
| Property scoping | **Fail / incomplete** | Booking queue rows are linked to bookings, but staff UI reads the queue directly. Housekeeping notification rows do not carry property_id and global supervisor resolution is not property-aware. |
| RBAC | **Fail / incomplete** | Generic notification SELECT policy permits owner/manager/admin visibility across the table; `listMyNotifications` includes rows with null `user_id`; mark-read function does not inspect or surface update errors. |
| Deduplication | **Partial** | Housekeeping uses unique `(recipient_user_id,event_id)`; commercial pipeline has idempotency keys. Generic notifications and pending queue have no general event-recipient idempotency contract. |
| Event integrity | **Partial** | Booking, guest request, and housekeeping database triggers are durable. Platform event bus is in-memory plus best-effort `activity_logs` persistence; persistence errors are swallowed and automation dispatch is best-effort. |
| Delivery reliability | **Partial / unproven** | Booking/guest queue worker has retry counters; a single drain path handles guest messages. No unified staff delivery worker / delivery ledger was found. |
| Acknowledgement | **Fail / fragmented** | Housekeeping has read_at; generic table has read_at; pending queue uses processed_at as read state in the global hook. No common acknowledged state. |
| Escalation / resolution | **Partial** | Housekeeping events include exception resolution; founder alerts support acknowledge/resolve. Generic operational staff notification lifecycle has no common escalation/resolution contract. |
| Auditability | **Partial** | Domain events and commercial audit trails exist, but notification recipient decisions and delivery attempts are not consistently persisted in one operational audit trail. |

## NSC-03 — Target consolidation boundary

Create one operational staff notification service with:
- immutable event envelope: event id, source event id, event type, module, organisation, property, entity, actor, severity, correlation id, occurred_at and payload snapshot;
- recipient deliveries: one row per event, recipient and channel, with a database-enforced idempotency key;
- recipient resolution based on the event's property membership, role policy and explicit assignee / original reporter references;
- separate delivery state, read state, acknowledgement state, escalation state and resolution state;
- retryable delivery attempts and provider references;
- RLS requiring active membership in the event property and recipient ownership, with an explicit authorized supervisor read policy limited to that property;
- event and delivery audit history.

Do not absorb:
- `pending_notifications` guest booking / guest request communication queue;
- `commercial_financial_notifications` and `commercial_founder_notifications`;
- guest concierge message delivery and guest channel preferences.

These may share transport primitives later, but their business contracts, recipient identities, consent rules and authorization boundaries remain distinct.

## NSC-04 — Operational domain integration matrix

| Domain | Required producer coverage | Required recipient policy | Certification event |
|---|---|---|---|
| Reservations | Created, confirmed, modified, cancelled, no-show, check-in, check-out | Reservations / reception / supervisor by property | Confirm and cancel a reservation |
| Payments / Finance (property operations) | Payment received, failed, mismatch, refund, reversal, reconciliation exception | Finance / supervisor by property | Verified payment and failed/mismatch case |
| Front Office | Arrival, check-in, room assignment, room-ready dependency, checkout | Reception / front office by property | Check-in and checkout |
| Housekeeping | Assigned, started, completed, inspection requested/passed/failed, exception reported/resolved, room ready | Assigned housekeeper, inspector, supervisor, front office readiness | Full task and inspection lifecycle |
| Maintenance | Work order created, assigned, overdue, escalated, resolved | Assigned maintenance owner and supervisor | Maintenance escalation and resolution |
| Inventory / Rooms / LexiBite | Out-of-service, low stock, wastage, purchase-order lifecycle, goods receipt, stocktake variance, stock transfer, reconciliation exception | Property manager / finance / admin via active reciprocal product connection | Room out-of-service + restore; connected LexiBite low-stock, receipt, variance and reconciliation events |
| Guest Experience | Guest request received, assigned, overdue, fulfilled, escalated | Guest service / reception; guest communications remain separate | Request assignment and fulfilment |
| Management | Critical exception, overdue escalation, unresolved operational risk | Property manager and authorized management | Escalation and resolution |

## NSC-05 — End-to-end certification gates

- Event producer emits a durable event with the correct organisation/property and source correlation.
- Replaying the same source event does not create duplicate event or recipient deliveries.
- Correct assigned user receives the notification; unauthorized users in another property receive none.
- Role-based recipients are resolved only from active property memberships.
- Notification appears in the shared staff centre and unread count updates in Realtime.
- Mark-read and acknowledge are distinct actions and persist independently of worker processing.
- Failed channel delivery is retried and recorded with provider reference / terminal failure.
- Overdue and critical notifications escalate to the configured supervisor / management recipients.
- Resolution closes the operational lifecycle without deleting the event or delivery audit.
- Guest and commercial notification contracts continue to pass their own tests.
- CI, migration tests, RLS tests and production-build checks pass before any deployment. Production data, roles and memberships are not modified by this sprint's UAT certification.

## Evidence limitations

This is a repository-source audit, not a live production database certification. It does not claim that every migration is applied in production, that every scheduled worker is enabled, or that any provider delivery succeeded in a live tenant. The implementation sprint must verify those facts in UAT using non-production fixtures before release.
