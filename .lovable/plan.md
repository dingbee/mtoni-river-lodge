
# Front Desk Command System — Implementation Plan

A unified operations console for Mtoni River Lodge that ties booking emails (Lovable Emails), WhatsApp staff alerts, Outlook mirroring, and a front-desk dashboard into one event-driven workflow.

## 1. Scope confirmation

Before I build, two decisions need confirmation because they require external credentials / setup:

1. **WhatsApp provider** — Twilio WhatsApp is the simplest path (already documented as a Lovable connector). Meta WhatsApp Cloud API is also possible but requires Business verification + a Meta app. **Default: Twilio WhatsApp via connector.** A staff phone number (E.164) is required as the alert recipient.
2. **Outlook mirroring** — Two options:
   - **(a) BCC every outbound email** to `bookings@mtoniriverlodge.com`. Simple, no OAuth, preserves SPF/DKIM because Lovable Emails signs the message and the BCC is delivered by the SMTP transport. **Recommended.**
   - **(b) Microsoft Graph push** (writes a copy into the mailbox via the Outlook connector). Requires per-user OAuth for that mailbox or an Entra app with `Mail.ReadWrite` on a shared mailbox.

   I'll implement (a) as the default and leave a hook so (b) can be added later. The existing `microsoft_outlook` connector authenticates the developer's mailbox, not arbitrary shared mailboxes, so option (b) is not a one-click setup.

I'll proceed with **Twilio + BCC** unless you say otherwise.

## 2. Database (one migration)

New tables (existing `bookings` table is kept and extended — it already has `guest_name`, `guest_email`, `guest_phone`, `check_in`, `check_out`, `status`, etc.):

- Add to `public.bookings`: `guest_type` enum (`standard|vip|climber`), generated from `special_requests` keywords or set manually.
- `public.guest_threads` — one row per booking; `timeline jsonb[]`, `notes text`, `last_updated`.
- `public.email_events` — `booking_id`, `event_type` (`queued|sent|delivered|bounced|failed`), `template_name`, `message_id`, `timestamp`. Backed by existing `email_send_log` data via a view + writer.
- `public.ops_tasks` — `booking_id`, `task_type`, `assigned_to uuid null`, `status`, `due_at`, `priority`.
- `public.whatsapp_alerts` — `booking_id`, `event_type`, `message`, `to_number`, `sent_at`, `provider_sid`, `status`, idempotency key.

All four get GRANTs (`authenticated` read, `service_role` all), RLS enabled, staff-only policies via existing `is_staff(auth.uid())`.

Triggers:
- `AFTER INSERT ON bookings` → seed `guest_threads`, create payment-followup `ops_task`, enqueue `booking-received` email, enqueue WhatsApp alert.
- `AFTER UPDATE OF status, payment_status ON bookings` → append timeline row, create room-prep task on `paid`, enqueue confirmation email + WhatsApp.
- Use `pg_net` (already enabled via cron) to hit internal server routes, OR write to a `pending_notifications` queue table the cron drains. **I'll use the queue table** to keep network calls out of triggers (more reliable, easier to retry).

## 3. Automation rule engine

A single server route `POST /api/public/ops/drain` runs every 30s via `pg_cron` (with `X-Cron-Secret` header). It:

1. Reads pending rows from `pending_notifications`.
2. For each: enqueues the right Lovable Email (`booking-received` / `booking-confirmed` / `payment-pending` / `payment-received` / `booking-cancelled`) with idempotency key `{event}-{booking_id}` and BCC `bookings@mtoniriverlodge.com`.
3. Sends WhatsApp via Twilio gateway (`/Messages.json`, `From=whatsapp:<sandbox>`, `To=whatsapp:<staff>`) with idempotency check against `whatsapp_alerts`.
4. Appends a `timeline` row to `guest_threads`.
5. Marks the queue row processed.

Morning digest: a cron-triggered server fn at 07:00 Africa/Dar_es_Salaam aggregates today's arrivals + VIP/climber highlights into one WhatsApp message.

## 4. Email layer

- Extend `src/lib/email/send-internal.server.ts` to accept `bcc` + `metadata.booking_id`.
- Update `/lovable/email/transactional/send` to forward `bcc` to Lovable Emails (sets `Bcc: bookings@mtoniriverlodge.com` on every booking template).
- Add new templates: `payment-pending.tsx`, `payment-received.tsx`, `booking-cancelled.tsx` (mirroring existing `_shared` styling).
- `email_send_log` insert → trigger that mirrors into `email_events` keyed by `booking_id` parsed from idempotency key / metadata.

## 5. WhatsApp integration (Twilio)

- New helper `src/lib/whatsapp/send.server.ts` calling the connector gateway (`https://connector-gateway.lovable.dev/twilio/Messages.json`) per the Twilio knowledge card.
- Uses `LOVABLE_API_KEY` + `TWILIO_API_KEY` (connector secret).
- Two new secrets needed from the user: **`WHATSAPP_FROM`** (e.g. `whatsapp:+14155238886`) and **`WHATSAPP_STAFF_TO`** (comma-separated E.164 staff numbers). I'll request them with `add_secret` once Twilio is connected.

## 6. Front Desk dashboard UI

New route `src/routes/_authenticated/admin.front-desk.tsx` (staff-only via existing `is_staff` check). Sections:

- **Today's Ops** — cards: check-ins today, check-outs today, pending payments, VIP arrivals (queries via server fn).
- **Kanban** — 5 columns (`new` / `pending_payment` / `confirmed` / `checked_in` / `completed`), drag-drop updates `bookings.status` (uses `@dnd-kit/core` already installed? if not, install).
- **Guest Thread drawer** — opens on card click; shows timeline + emails + WhatsApp alerts + editable staff notes.
- **Alerts panel** — derived view: overdue payments (`balance_due > 0 AND check_in < now() + 3 days`), VIP arrivals next 48h, climber logistics.

Realtime updates via Supabase Realtime on `bookings`, `guest_threads`, `ops_tasks`.

## 7. Files to create / change

**New:**
- `supabase/migrations/<ts>_front_desk_system.sql` (schema + triggers + grants)
- `src/lib/whatsapp/send.server.ts`
- `src/lib/whatsapp/templates.ts`
- `src/lib/front-desk.functions.ts` (server fns: list bookings, update status, add note, complete task)
- `src/lib/email-templates/payment-pending.tsx`
- `src/lib/email-templates/payment-received.tsx`
- `src/lib/email-templates/booking-cancelled.tsx`
- `src/routes/api/public/ops/drain.ts` (cron worker, secret-gated)
- `src/routes/api/public/ops/morning-digest.ts`
- `src/routes/_authenticated/admin.front-desk.tsx`
- `src/components/front-desk/{TodayOps,KanbanBoard,GuestThreadDrawer,AlertsPanel}.tsx`

**Updated:**
- `src/lib/email/send-internal.server.ts` (add bcc + metadata)
- `src/routes/lovable/email/transactional/send.ts` (forward bcc)
- `src/lib/email-templates/registry.ts` (new templates)
- `src/lib/booking.functions.ts` (write to `pending_notifications` instead of calling email inline)

## 8. What I need from you before building

Please confirm:

1. ✅ Proceed with **Twilio WhatsApp + BCC mirroring** (default), OR specify Meta Cloud API / Microsoft Graph push instead.
2. The Twilio connector must be linked (I'll prompt the connect dialog when ready).
3. Staff WhatsApp recipient number(s) in E.164 format (e.g. `+255…`). I'll request these as secrets after Twilio is connected.
4. Confirm the BCC target is exactly `bookings@mtoniriverlodge.com`.

Once you confirm, I'll execute the plan end-to-end in the next turn.
