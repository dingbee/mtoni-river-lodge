import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public/ops/morning-digest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get('apikey')
        if (!process.env.SUPABASE_PUBLISHABLE_KEY || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response('unauthorized', { status: 401 })
        }
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const { sendStaffWhatsApp } = await import('@/lib/whatsapp/send.server')
        const { morningDigest } = await import('@/lib/whatsapp/templates')

        const today = new Date().toISOString().slice(0, 10)
        const { data: bookings } = await supabaseAdmin
          .from('bookings')
          .select('id, reference, guest_name, guest_type, room_id, check_in, check_out, status, payment_status, total, currency, balance_amount, guest_phone')
          .eq('check_in', today)
          .in('status', ['confirmed', 'pending'])

        const items = await Promise.all((bookings ?? []).map(async (b) => {
          const { data: r } = await supabaseAdmin.from('rooms').select('name').eq('id', b.room_id).maybeSingle()
          return { ...b, room_name: r?.name ?? null } as any
        }))

        await sendStaffWhatsApp({
          bookingId: items[0]?.id ?? '00000000-0000-0000-0000-000000000000',
          eventType: 'morning_digest',
          idempotencyKey: `morning-digest-${today}`,
          message: morningDigest(items),
        })
        return Response.json({ ok: true, arrivals: items.length })
      },
    },
  },
})