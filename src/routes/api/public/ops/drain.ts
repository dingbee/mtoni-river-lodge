import { createFileRoute } from '@tanstack/react-router'

// Drains pending_notifications: enqueues guest emails (with BCC to Outlook)
// and dispatches WhatsApp staff alerts. Idempotent per (event_type, booking_id).

const EMAIL_BY_EVENT: Record<string, string | null> = {
  booking_created: 'booking-received',
  status_confirmed: 'booking-confirmed',
  status_cancelled: 'booking-cancelled',
  payment_paid: 'payment-received',
  payment_partial: 'payment-pending',
  payment_unpaid: 'payment-pending',
}

export const Route = createFileRoute('/api/public/ops/drain')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Lightweight auth: anon key in apikey header (canonical cron pattern)
        const apiKey = request.headers.get('apikey')
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY
        if (!expected || apiKey !== expected) {
          return new Response('unauthorized', { status: 401 })
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { sendTransactionalInternal } = await import('@/lib/email/send-internal.server')
        const { sendStaffWhatsApp } = await import('@/lib/whatsapp/send.server')
        const wt = await import('@/lib/whatsapp/templates')

        const { data: jobs, error } = await supabaseAdmin
          .from('pending_notifications')
          .select('id, booking_id, event_type, payload, attempts')
          .is('processed_at', null)
          .lt('attempts', 5)
          .order('created_at', { ascending: true })
          .limit(25)
        if (error) {
          return Response.json({ error: error.message }, { status: 500 })
        }

        const results: any[] = []
        for (const job of jobs ?? []) {
          try {
            // Load booking snapshot
            const { data: b } = await supabaseAdmin
              .from('bookings')
              .select(
                'id, reference, guest_name, guest_email, guest_phone, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, currency, status, payment_status, guest_type, room_id',
              )
              .eq('id', job.booking_id)
              .maybeSingle()
            if (!b) {
              await supabaseAdmin
                .from('pending_notifications')
                .update({ processed_at: new Date().toISOString(), last_error: 'booking_missing' })
                .eq('id', job.id)
              continue
            }
            const { data: room } = await supabaseAdmin
              .from('rooms').select('name').eq('id', b.room_id).maybeSingle()

            const snap: any = {
              reference: b.reference,
              guest_name: b.guest_name,
              room_name: room?.name ?? null,
              check_in: b.check_in,
              check_out: b.check_out,
              status: b.status,
              payment_status: b.payment_status,
              total: b.total,
              currency: b.currency,
              balance_amount: b.balance_amount,
              guest_type: b.guest_type,
              guest_phone: b.guest_phone,
            }

            // 1) Guest email (if mapped)
            const tpl = EMAIL_BY_EVENT[job.event_type]
            if (tpl) {
              await sendTransactionalInternal({
                templateName: tpl,
                recipientEmail: b.guest_email,
                idempotencyKey: `${tpl}-${b.id}`,
                bookingId: b.id,
                bcc: ['bookings@mtoniriverlodge.com'],
                templateData: {
                  reference: b.reference,
                  guestName: b.guest_name,
                  roomName: room?.name,
                  checkIn: b.check_in,
                  checkOut: b.check_out,
                  nights: b.nights,
                  adults: b.adults,
                  children: b.children ?? 0,
                  total: b.total,
                  deposit: b.deposit_amount,
                  balance: b.balance_amount,
                  currency: b.currency,
                },
              })
            }

            // 2) WhatsApp staff alert
            let message: string | null = null
            switch (job.event_type) {
              case 'booking_created':
                message = wt.newBookingMsg(snap)
                break
              case 'payment_paid':
                message = wt.paymentReceivedMsg(snap)
                break
              case 'payment_partial':
              case 'payment_unpaid':
                message = wt.paymentPendingMsg(snap)
                break
              case 'status_cancelled':
                message = wt.bookingCancelledMsg(snap)
                break
              case 'status_checked_in':
                message = wt.checkInTodayMsg(snap)
                break
              default:
                message = null
            }
            // VIP/climber → also send priority alert on creation
            if (job.event_type === 'booking_created' && b.guest_type !== 'standard') {
              await sendStaffWhatsApp({
                bookingId: b.id,
                eventType: 'priority',
                idempotencyKey: `priority-${b.id}`,
                message: wt.vipPriorityMsg(snap),
              })
            }
            if (message) {
              await sendStaffWhatsApp({
                bookingId: b.id,
                eventType: job.event_type,
                idempotencyKey: `${job.event_type}-${b.id}`,
                message,
              })
            }

            await supabaseAdmin
              .from('pending_notifications')
              .update({ processed_at: new Date().toISOString() })
              .eq('id', job.id)
            results.push({ id: job.id, ok: true })
          } catch (e: any) {
            await supabaseAdmin
              .from('pending_notifications')
              .update({ attempts: (job.attempts ?? 0) + 1, last_error: e?.message ?? String(e) })
              .eq('id', job.id)
            results.push({ id: job.id, ok: false, error: e?.message })
          }
        }

        return Response.json({ ok: true, processed: results.length, results })
      },
    },
  },
})