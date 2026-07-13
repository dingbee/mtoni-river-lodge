# Mtoni OS — Domains (DDD layout)

Each folder owns one business domain and keeps its components, services
(server fns), types, hooks, and validation together.

- `guests/` — Guest identity, CRM, notes, tags
- `reservations/` — Bookings, availability, pricing, extras
- `content/` — CMS: rooms, articles, gallery
- `marketing/` — Reviews, SEO, campaigns, analytics
- `finance/` — Payments, Pesapal, invoices, reports
- `staff/` — Roles, users, permissions
- `automation/` — Notifications, cron, event handlers
- `_platform/` — Cross-cutting services (Module Registry, Feature Flags, Event Bus)

## Adding a new module

1. Register it in `_platform/registry/modules/<name>.module.ts`
2. Add permissions to `MODULE_ROLES` in `src/lib/permissions.ts`
3. Add its feature flag to `_platform/flags/flags.ts`
4. Optionally register search/notification providers on the module def
5. Emit domain events with `emitPlatformEvent()` from `_platform/events`

No other files need change: navigation, breadcrumbs, permissions,
dashboards, and the audit log all consume the registry.

## Backward compatibility

Sprint 1 code stays in place. New code lands here. Existing files can be
moved into `src/domains/*` over future sprints without breaking imports.
