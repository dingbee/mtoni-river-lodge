# Sprint 2+ — Platform Core Services — Handover

## New platform services
- **Module Registry** — `src/domains/_platform/registry/` — one entry per module (id, name, icon, route, roles, flag, status, optional search/notification providers, widgets).
- **Feature Flags** — `src/domains/_platform/flags/` — states: enabled / disabled / beta (staff) / internal (owner/admin). Pure resolver + React hook.
- **Event Bus** — `src/domains/_platform/events/` — typed in-memory pub/sub plus `emitPlatformEvent` server function that persists to `activity_logs`.

## DDD layout
Added `src/domains/{guests,reservations,content,marketing,finance,staff,automation,_platform}/`. Sprint 1 code untouched; new work lands under the appropriate domain.

## Files added
- `src/domains/README.md`
- `src/domains/_platform/index.ts`
- `src/domains/_platform/flags/{types.ts,flags.ts,useFeatureFlag.ts,index.ts}`
- `src/domains/_platform/registry/{types.ts,registry.ts,hooks.ts,nav-adapter.ts,index.ts}`
- `src/domains/_platform/registry/modules/{reservations,guests,content,marketing,finance,staff,housekeeping,automation,system,future}.module.ts`
- `src/domains/_platform/events/{types.ts,bus.ts,emit.functions.ts,index.ts}`

## Files modified
- None in Sprint 1 code paths (deliberate — no user-facing behavior change).

## Database changes
- `activity_logs` gained columns: `module text`, `severity text` (check: info|warn|error|audit), `correlation_id uuid`.
- Indexes: `idx_activity_logs_module`, `idx_activity_logs_correlation`. RLS unchanged.

## New interfaces & types
- `ModuleDefinition`, `ResolvedModule`, `SearchProvider`, `NotificationProvider`, `DashboardWidget`, `ModuleStatus`
- `FeatureFlag`, `FeatureFlagKey`, `FlagState`, `FlagAudience`
- `PlatformEvent<TMeta>`, `PlatformEventType`, `EventSeverity`, `EventListener`

## Extension points
- `defineModule({...})` — type-checked module definition
- `resolveModules(registry, audience, canAccess)` — pure filter
- `useVisibleModules()`, `useModule(id)`, `useModuleBreadcrumbs()`
- `isFlagVisible(flag, { roles })`, `assertFlagEnabled(key, audience)`, `useFeatureFlag(key)`
- `publishEvent({...})` — emits locally and persists via server fn
- `subscribe(type, handler)` — in-process listeners

## Test coverage
Pure functions are unit-testable without any DOM/DB: `resolveModules`, `isFlagVisible`, `findModuleByRoute`, event bus `on/off/emit`. Tests not added this sprint.

## Known limitations
- Event bus is in-memory, per-tab; cross-tab requires a future BroadcastChannel adapter.
- Feature flags are code-only; no admin UI or DB overrides yet.
- `AdminSidebar` still consumes the legacy `NAV` in `nav-config.ts` to guarantee zero visual regression. `nav-adapter.ts` provides a drop-in `buildNavFromRegistry()` for the next sprint.
- Sprint 1 CRM/booking/CMS writers still call `activity_logs` directly; migrating them to `publishEvent()` is a Sprint 3 chore.

## Recommended follow-up
1. Switch `AdminSidebar` to `useVisibleModules()` via the nav adapter.
2. Move CRM server fns (`src/lib/guests.functions.ts`) into `src/domains/guests/services/`.
3. Add a `feature_flags` table + admin UI for runtime overrides.
4. Wire `publishEvent()` into booking, guest, payment, and review writers.
5. Add BroadcastChannel adapter for cross-tab event fan-out.

## Technical debt
- Two parallel navigation sources (legacy NAV + registry) until Sprint 3.
- `MODULE_ROLES` in `src/lib/permissions.ts` duplicates `requiredRoles` on modules; consolidate when sidebar switches.

## Sprint 3 readiness (Guest CRM deepening)
Green. Registry, flags, and event bus give Sprint 3 clean extension points: register new CRM sub-modules, flag experimental features under `beta`, and emit `guest.*` events without touching the sidebar or activity-log pages.
