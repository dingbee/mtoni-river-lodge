# Sprint 4 — Operations Centre (OC)

Rename "Booking Ops Command Centre" → **Operations Centre (OC)**. All work sits on top of the existing custom booking engine, guest CRM, and Sprint 2+ platform (Module Registry, Feature Flags, Event Bus). No booking-engine redesign, no data duplication.

## Domain layout (DDD)

```
src/domains/
  operations/         ← NEW
    rooms/            room status board + housekeeping
    tasks/            ops_tasks CRUD + assignments
    alerts/           derived alerts from event bus + queries
    calendar/         day/week/month room calendar
    checkin/          check-in flow orchestration
    checkout/         check-out flow orchestration
    dashboard/        live KPI + widget queries
    timeline/         event feed derived from activity_logs
    index.ts
  reservations/       ← extended (workspace, filters, notes)
```

Server functions live in `src/lib/operations.functions.ts` (client-safe module path) and `src/lib/operations-tasks.functions.ts`. Both re-exported through `domains/operations/*/index.ts` façades so components import from the domain.

## Schema (single migration)

Additive only — no changes to existing booking/guest columns.

- `public.room_states` — one row per physical room instance
  - `id`, `room_id` (fk rooms), `unit_label` (e.g. "Riverfront #2"), `state` (enum: vacant_clean, vacant_dirty, occupied, reserved, inspection, maintenance, out_of_service), `state_note`, `updated_by`, `updated_at`, `booking_id` (nullable link to current stay)
  - GRANTs authenticated + service_role; RLS staff-only (`is_any_staff(auth.uid())`)
  - Trigger `set_updated_at`
- `public.ops_tasks` **already exists** — extend with:
  - `assignee_id uuid null references auth.users(id)`
  - `status text default 'open'` (open, in_progress, done, cancelled)
  - `category text` (housekeeping, concierge, maintenance, transport, fnb, other)
  - Index on `(status, due_at)` and `(assignee_id, status)`
- `public.ops_alerts` — derived/materialized-on-write alerts
  - `id`, `kind` (late_arrival, overdue_departure, payment_issue, room_conflict, maintenance_conflict), `severity`, `booking_id`, `room_id`, `message`, `resolved_at`, `resolved_by`, `created_at`
  - GRANTs + RLS staff-only
- Views (SECURITY INVOKER):
  - `ops_today` — arrivals, departures, in_house counts for `CURRENT_DATE`
  - `ops_room_board` — join rooms × room_states × today's bookings
  - `ops_outstanding_balances` — bookings with balance > 0

Seed `room_states` from existing `rooms` on migration (one row per `total_units`) so the board renders immediately.

## Server functions

`src/lib/operations.functions.ts` (all `.middleware([requireSupabaseAuth])`):
- `getOpsDashboard()` — today counts, occupancy, dirty/maint rooms, outstanding total
- `getRoomBoard()` — room state grid data
- `updateRoomState({id, state, note?})` — writes state + emits `room.state_changed`
- `getReservationWorkspace({id})` — booking + guest CRM summary + payments + extras + tasks + timeline
- `checkInBooking({bookingId, roomStateId, arrivalTime, notes})` — updates booking status → `checked_in`, room_state → `occupied`, emits `reservation.checked_in`
- `checkOutBooking({bookingId, departureTime, notes})` — status → `checked_out`, room_state → `vacant_dirty`, creates housekeeping task, emits `reservation.checked_out`
- `getOpsCalendar({from,to})` — bookings + inventory blocks per room per day
- `assignRoom({bookingId, roomStateId})` — assigns a physical room to a reservation
- `listOpsAlerts({resolved?})` / `resolveOpsAlert({id})`
- `getOpsTimeline({limit})` — reads `activity_logs` where `module in (operations, reservations, guests, finance)`

`src/lib/operations-tasks.functions.ts`:
- `listOpsTasks({filters})`, `createOpsTask`, `updateOpsTask`, `assignOpsTask`, `completeOpsTask`
- Emits `task.created`, `task.completed`

All state-changing fns call `publishEvent(...)` from `@/domains/_platform/events` so timeline + alerts stay live.

## Routes (all under `_authenticated/admin`)

New:
- `admin.operations.tsx` — layout with sub-nav (`<Outlet />`)
- `admin.operations.index.tsx` — **Live Dashboard** (module 1 + 11 KPIs)
- `admin.operations.rooms.tsx` — **already exists**, replace body with Room Status Board (module 2)
- `admin.operations.calendar.tsx` — **already exists**, replace with interactive day/week/month calendar (module 7)
- `admin.operations.housekeeping.tsx` — Housekeeping workspace (module 8)
- `admin.operations.tasks.tsx` — Ops tasks board (module 6)
- `admin.operations.alerts.tsx` — Alerts list (module 9)
- `admin.operations.timeline.tsx` — Daily ops timeline (module 10)
- `admin.operations.reservations.$id.tsx` — Reservation Workspace (module 3)
- `admin.operations.checkin.$id.tsx` — Check-in wizard (module 4)
- `admin.operations.checkout.$id.tsx` — Check-out wizard (module 5)

Existing `admin.front-desk.tsx` and `admin.bookings.tsx` remain untouched (backward compat); the OC dashboard links into them as the authoritative reservation list.

## Components (`src/components/os/operations/`)

- `LiveDashboardGrid.tsx` — widgets with deep links
- `RoomStatusBoard.tsx` + `RoomStateChip.tsx` (color-coded)
- `ReservationWorkspaceLayout.tsx` (guest panel + payments + tasks + timeline)
- `CheckInWizard.tsx`, `CheckOutWizard.tsx` (multi-step form, uses shadcn `Tabs`/`Stepper` pattern)
- `TaskBoard.tsx` + `TaskCard.tsx` (kanban by status)
- `RoomCalendar.tsx` with day/week/month toggle
- `HousekeepingBoard.tsx` (columns: dirty, in progress, ready, inspection, maintenance)
- `OpsAlertsList.tsx`
- `OpsTimelineFeed.tsx` (consumes both `activity_logs` and live `subscribe("*")` for realtime updates)
- `KpiCard.tsx` for module 11 metrics

Reuse existing `PageHeader`, `SectionCard`, `StatCard`, `GuestStatusChip`, CRM panels.

## Module Registry

Register in `src/domains/_platform/registry/modules/operations.module.ts`:
- `operations.dashboard`, `operations.rooms`, `operations.calendar`, `operations.housekeeping`, `operations.tasks`, `operations.alerts`, `operations.timeline`
- Feature flag `operations_centre` (default enabled)
- Roles: owner, manager, reception, admin; housekeeping module also visible to `housekeeping` role.

Update `nav-config.ts` to add the Operations Centre group (backward-compatible; existing Front Desk / Bookings entries stay).

## Event Bus

Extend `PlatformEventType` union with:
- `room.state_changed`, `reservation.checked_in`, `reservation.checked_out`, `task.created`, `task.assigned`, `task.completed`, `ops.alert_raised`, `ops.alert_resolved`

Alert generator: `admin.operations.alerts.tsx` loader triggers `refreshOpsAlerts()` server fn that computes late arrivals (check_in < today AND status='confirmed'), overdue departures (check_out < today AND status='checked_in'), payment issues (balance > 0 AND check_in <= today), and upserts into `ops_alerts`.

## What we deliberately do NOT build (leave stubs / TODO)

- Drag-and-drop calendar reassignment → calendar renders read-only in day/week/month; drag hooks stubbed with TODO
- Mobile housekeeping app
- Automated review request queueing (Module 5 last bullet) — noted in code as future automation
- SMS/push alert delivery (only in-app alerts)

## Verification

- `bun run build:dev` passes
- Existing routes (`/admin/bookings`, `/admin/front-desk`, `/admin/guests/crm/*`, `/book`, booking form) unchanged
- New OC nav visible; each widget deep-links correctly
- Check-in updates `bookings.status` and `room_states.state` atomically; timeline reflects both

## Rollout order

1. Migration (schema + seed + grants + RLS)
2. Server functions + event type extensions
3. Registry + nav
4. Layout route + dashboard + KPIs
5. Room board + housekeeping
6. Reservation workspace
7. Check-in / check-out wizards
8. Tasks + alerts + timeline + calendar
