import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

// All front-desk reads/writes are staff-only — RLS enforces is_staff().

export const listFrontDeskBookings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase
    const { data, error } = await sb
      .from('bookings')
      .select(
        'id, reference, guest_name, guest_email, guest_phone, check_in, check_out, nights, adults, children, total, currency, balance_amount, status, payment_status, guest_type, room_id, created_at',
      )
      .order('check_in', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    const roomIds = Array.from(new Set((data ?? []).map((b) => b.room_id)))
    const { data: rooms } = await sb.from('rooms').select('id, name, slug').in('id', roomIds)
    const roomMap = new Map((rooms ?? []).map((r) => [r.id, r]))
    return (data ?? []).map((b) => ({
      ...b,
      total: Number(b.total),
      balance_amount: Number(b.balance_amount),
      room: roomMap.get(b.room_id) ?? null,
    }))
  })

export const getGuestThread = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase
    const [{ data: thread }, { data: emails }, { data: wa }, { data: tasks }] = await Promise.all([
      sb.from('guest_threads').select('*').eq('booking_id', data.bookingId).maybeSingle(),
      sb.from('email_events').select('*').eq('booking_id', data.bookingId).order('occurred_at', { ascending: false }).limit(50),
      sb.from('whatsapp_alerts').select('*').eq('booking_id', data.bookingId).order('created_at', { ascending: false }).limit(50),
      sb.from('ops_tasks').select('*').eq('booking_id', data.bookingId).order('created_at', { ascending: false }),
    ])
    return { thread, emails: emails ?? [], whatsapp: wa ?? [], tasks: tasks ?? [] }
  })

export const updateBookingStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      bookingId: z.string().uuid(),
      status: z.enum(['pending', 'confirmed', 'cancelled', 'checked_in', 'completed']),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('bookings').update({ status: data.status }).eq('id', data.bookingId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const saveStaffNote = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bookingId: z.string().uuid(), notes: z.string().max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('guest_threads')
      .update({ notes: data.notes, last_updated: new Date().toISOString() })
      .eq('booking_id', data.bookingId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const completeTask = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('ops_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', data.taskId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const listOpenTasks = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('ops_tasks')
      .select('id, booking_id, task_type, title, description, priority, status, due_at, created_at')
      .neq('status', 'completed')
      .order('priority', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200)
    if (error) throw new Error(error.message)
    return data ?? []
  })