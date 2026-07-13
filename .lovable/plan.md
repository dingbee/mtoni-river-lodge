# Sprint 2+ — Platform Core Services

Goal: land three reusable platform services (Module Registry, Feature Flags, Event Bus) and adopt a Domain-Driven Design folder layout, without changing any user-facing behaviour from Sprint 1.

## 1. Domain-Driven layout

New top-level folder `src/domains/` with one folder per business domain:

```text
src/domains/
  guests/         # CRM, guest identity, notes, tags
  reservations/   # bookings, availability, pricing, extras
  content/        # CMS, rooms marketing content, articles
  marketing/      # reviews, SEO, campaigns
  finance/        # payments, Pesapal, invoices
  staff/          # roles, users, permissions
  automation/     # notifications, event handlers, cron
  _platform/      # cross-cutting: registry, flags, event bus
```

Each domain has its own `components/`, `services/` (server fns), `types.ts`, `hooks/`, `schema.ts` (zod). Sprint 1 code stays in place; new code lands in `src/domains/` and existing files are re-exported (no moves this sprint) to preserve routes, imports, and the booking engine.

## 2. Module Registry — `src/domains/_platform/registry/`

- `types.ts` — `ModuleDefinition` with: `id`, `name`, `description`, `icon` (LucideIcon), `route`, `parentId`, `order`, `landingRoute`, `requiredRoles: AppRole[]`, `featureFlag?: FeatureFlagKey`, `search?: SearchProvider`, `notifications?: NotificationProvider`, `widgets?: DashboardWidget[]`, `status: 'active' | 'beta' | 'hidden' | 'disabled'`.
- `registry.ts` — `defineModule()` helper + `moduleRegistry` array (static, tree-shakeable, strongly typed).
- `modules/*.module.ts` — one file per existing module (Reservations, Guests CRM, Reviews, Content, SEO, Staff, Settings, and hidden stubs for Housekeeping/Finance/Loyalty/Marketing/Multi-property/Concierge/Maintenance/Procurement/AI Assistant).
- Hooks: `useVisibleModules()`, `useModule(id)`, `useModuleBreadcrumbs(pathname)`. These consult flags + roles + status.
- Wire `AdminSidebar` and admin breadcrumbs to consume the registry (keeps current visual output; just data-driven).

## 3. Feature Flags — `src/domains/_platform/flags/`

- `types.ts` — `type FlagState = 'enabled' | 'disabled' | 'beta' | 'internal'`; `FeatureFlagKey` union.
- `flags.ts` — single source of truth object: `{ [key]: { state, description, since } }`. Editable in code now; schema leaves room for a DB-backed override later.
- `useFeatureFlag(key)` + `isFlagVisible(state, { roles })` — `beta` needs staff, `internal` needs admin/owner, `disabled` hides.
- Registered flags: `guest_crm` (enabled), `housekeeping`, `finance`, `ai_assistant`, `loyalty`, `marketing_automation`, `multi_property`, `concierge`, `maintenance`, `procurement` (all `disabled` initially).
- Route guard helper `assertFlagEnabled(key)` for future protected routes; not applied to Sprint 1 routes.

## 4. Event Bus — `src/domains/_platform/events/`

- `types.ts` — `PlatformEvent<TType, TMeta>` with `id`, `type`, `at`, `userId`, `module`, `entityType`, `entityId`, `meta`, `severity: 'info'|'warn'|'error'|'audit'`, `correlationId`.
- Typed event catalogue: `EventTypeMap` union covering `reservation.created/updated/cancelled`, `guest.created/updated`, `payment.received`, `review.published`, `article.published`, `image.uploaded`, `user.login`, `user.role_changed`, `seo.updated`.
- Client bus: in-memory `EventBus` with `on/off/emit`; SSR-safe (no window refs at module scope).
- Server sink: `emitPlatformEvent` server fn writes to existing `activity_logs` table (module, action, entity_type, entity_id, metadata, severity, correlation_id). Adds a small DB migration to add missing columns (`module text`, `severity text default 'info'`, `correlation_id uuid`) if absent, plus grants/RLS aligned with current `activity_logs` policies. Activity Log UI reads from same table — no shape change to existing rows.
- Adapters (thin, opt-in): `logReservationEvent`, `logGuestEvent`, etc. Existing writers keep working; new call sites use these adapters.

## 5. Cross-service wiring

- Registry entries reference `featureFlag` keys — resolved at render.
- `useVisibleModules()` composes: `status !== 'disabled'` && flag visible for current user && `has_any_role(requiredRoles)`.
- Search + notification providers are optional properties on the module def; central `searchRegistry`/`notificationRegistry` iterate visible modules.
- Event Bus consumers subscribe by module id → no circular imports (platform never imports domain code; domains import platform).

## 6. Verification

- `bun run build:dev` passes.
- Manual: existing sidebar still shows Reservations/Guests/Reviews/Content, protected routes still gated, booking flow unchanged, activity log page still renders.
- Unit-testable: registry filter, flag resolver, and event serializer are pure functions with no I/O.

## 7. Handover report

Delivered at end of sprint in `.lovable/sprint-2plus-handover.md` covering: files added, DB migration, new interfaces (`ModuleDefinition`, `FeatureFlag`, `PlatformEvent`), extension points (`defineModule`, `defineFlag`, `emitPlatformEvent`), limitations (in-memory bus only; no admin UI for flags yet; DDD reorg is additive, not a physical move), Sprint 3 readiness (CRM already lives under `src/domains/guests/` re-exports).

## Out of scope

- Physically moving Sprint 1 files into `src/domains/*` (only re-export shims to avoid regressions).
- Admin UI for editing flags.
- Persisting the event bus subscription graph.
- Replacing Sprint 1 activity-log writers (adapters land, migration is opt-in per call site).
