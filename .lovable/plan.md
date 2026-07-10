
## Mtoni OS Sprint 1 — Platform Shell & Core Architecture

Transforms the existing `/admin/*` area into a proper application shell without touching the public marketing site, the booking engine, review/CMS logic, or any current URLs. Existing pages (`/admin/bookings`, `/admin/front-desk`, `/admin/reviews`) keep their routes and get re-linked from the new sidebar.

---

### 1. Route architecture

New layout route:
- `src/routes/_authenticated/admin.tsx` — Mtoni OS shell (sidebar + top bar + breadcrumbs + `<Outlet />`).

Move current admin leaves under it (URL unchanged because `_authenticated` and pathless segments don't affect the URL):
- rename `_authenticated.admin.bookings.tsx` → `_authenticated/admin.bookings.tsx`
- rename `_authenticated.admin.front-desk.tsx` → `_authenticated/admin.front-desk.tsx`
- rename `_authenticated.admin.reviews.tsx` → `_authenticated/admin.reviews.tsx`

New leaf routes:
- `admin.index.tsx` → `/admin` dashboard
- `admin.operations.calendar.tsx`, `admin.operations.rooms.tsx`, `admin.operations.housekeeping.tsx`
- `admin.guests.crm.tsx`, `admin.guests.messages.tsx`
- `admin.content.homepage.tsx`, `admin.content.rooms.tsx`, `admin.content.experiences.tsx`, `admin.content.journal.tsx`, `admin.content.gallery.tsx`, `admin.content.media.tsx`
- `admin.marketing.seo.tsx`, `admin.marketing.campaigns.tsx`, `admin.marketing.analytics.tsx`
- `admin.finance.payments.tsx`, `admin.finance.invoices.tsx`, `admin.finance.reports.tsx`
- `admin.staff.users.tsx`, `admin.staff.roles.tsx`, `admin.staff.activity.tsx` (re-uses existing activity log viewer)
- `admin.automation.tsx`, `admin.settings.tsx`

Sidebar labels re-map existing routes:
- Reservations → `/admin/bookings`
- Reviews → `/admin/reviews`
- Front Desk (housekeeping/tasks card too) links to `/admin/front-desk`

Non-implemented leaves render the shared `<ComingSoon />` component.

### 2. Shell components

Under `src/components/os/`:
- `AdminShell.tsx` — desktop grid (sidebar + main), mobile drawer via `Sheet`, persists collapsed state in `localStorage`, respects `pb-safe`.
- `AdminSidebar.tsx` — grouped nav from a single `nav-config.ts`, active state via `useRouterState`, collapsible groups, role-gated items.
- `AdminTopbar.tsx` — page title, breadcrumbs (derived from route match tree), global search trigger (`⌘K`), notifications bell, user menu (sign out reuses existing flow).
- `Breadcrumbs.tsx` — reads `useMatches()` and per-route `staticData.crumb`.
- `CommandPalette.tsx` — `cmdk` dialog with pluggable providers (`searchProviders.ts`); providers registered for Bookings, Reviews, Journal, Rooms, Settings; each provider is a stub returning nav links plus a `TODO: Supabase query` comment.
- `NotificationsPanel.tsx` — slide-over sheet reading from a `useNotifications()` hook that returns an empty array + typed shape; ready for Sprint 2 wiring.
- `ComingSoon.tsx` — reusable empty state.
- `PageHeader.tsx`, `StatCard.tsx`, `SectionCard.tsx`, `DataTable.tsx` (thin wrapper over `@tanstack/react-table` if already present, else simple `Table` wrapper), `EmptyState.tsx`, `LoadingState.tsx`, `ErrorState.tsx`.

All use existing shadcn primitives and design tokens in `src/styles.css` — no hard-coded colors.

### 3. Dashboard `/admin`

`StatCard` grid: Occupancy, Today's arrivals, Today's departures, Pending bookings, Revenue (MTD), Reviews (avg + count), Website traffic, Notifications. Data comes from a `useDashboardMetrics()` hook that returns placeholder values with a clear `// TODO(sprint-2): wire to Supabase` marker per card. Two side panels: recent activity (already wired to `activity_logs`) and upcoming arrivals (placeholder).

### 4. Permissions framework

DB migration adds new roles to the `app_role` enum and helpers:

```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reception';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'marketing';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'housekeeping';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'editor';

-- helper: any-of check + module capability map
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role = ANY(_roles))
$$;
```

`is_staff()` extended to include `owner` and `manager`. Existing `admin` role is preserved and treated as `owner` in the client capability map. No changes to existing RLS policies — everything currently gated on `admin` keeps working.

Client-side: `src/lib/permissions.ts` exports a `MODULE_ROLES` map and a `useCurrentUserRoles()` hook (server function backed by `user_roles`). Sidebar items and route `beforeLoad` guards use it; unauthorised nav items are hidden and direct URL access redirects to `/admin`.

### 5. Notification + search frameworks

- `src/lib/notifications.ts` — typed `Notification` shape (`booking_created`, `payment_received`, `review_submitted`, `form_submission`, `room_maintenance`, `task_assigned`), `useNotifications()` hook stubbed to `[]`, `useUnreadCount()`. Panel UI renders empty state today, ready for Sprint 2 subscription to `pending_notifications`.
- `src/lib/search/registry.ts` — `SearchProvider` interface (`id`, `label`, `icon`, `search(query): Promise<SearchResult[]>`). Registered stubs for each entity; command palette merges results.

### 6. Design system

Add to `src/styles.css` (admin-scoped tokens, no impact on marketing pages):
- `--admin-bg`, `--admin-surface`, `--admin-sidebar`, `--admin-border`, `--admin-accent` mapped via `@theme inline`.
- Utility variants (`status-success`, `status-warning`, `status-danger`, `status-info`) as `@utility` blocks used by `StatusChip`.

`StatusChip`, `PageHeader`, `SectionCard`, `EmptyState`, `LoadingState`, `ErrorState`, `StatCard` all live in `src/components/os/` and are used across every new page.

### 7. Preserved functionality

- `src/routes/_authenticated.tsx` gate unchanged.
- Public site, booking engine, `/admin/bookings`, `/admin/front-desk`, `/admin/reviews` code untouched aside from the file move — the components are re-exported as-is inside the new shell.
- `src/start.ts`, `auth-attacher`, `auth-middleware`, all server functions untouched.

### 8. Verification

- `tsgo --noEmit` after all edits.
- Playwright smoke run against `http://localhost:8080/admin` with the injected Supabase session: screenshot dashboard, click into Reservations, Reviews, Front Desk, a coming-soon page, toggle sidebar collapse, open command palette, verify no console errors.
- Manual regression check against public routes `/`, `/reviews`, `/book` (screenshot only, no interaction).

### 9. Out of scope for this sprint

- Real data wiring for occupancy/revenue/traffic cards.
- Live notifications subscription.
- Search provider implementations (only interface + stubs).
- Housekeeping / calendar / CRM / SEO / campaigns / finance business logic.

---

Approve and I'll start with the DB migration for roles, then land the shell, route skeleton, dashboard, and framework stubs in one pass.
