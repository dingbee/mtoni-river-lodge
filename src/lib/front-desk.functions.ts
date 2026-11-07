import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'
import { requireStayNasModuleAccess } from '@/lib/staynas-authorization.server'

// All front-desk reads/writes are staff-only — RLS enforces is_staff().

export const listFrontDeskBookings = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, 'front-desk')
    const sb = context.supabase
    const { data, error } = await sb
      .from('bookings')
      .select(
        'id, reference, guest_name, guest_email, guest_phone, check_in, check_out, nights, adults, children, total, currency, balance_amount, status, payment_status, guest_type, room_id, guest_id, source, created_at',
      )
      .order('check_in', { ascending: true })
      .limit(200)
    if (error) throw new Error(error.message)
    const roomIds = Array.from(new Set((data ?? []).map((b) => b.room_id)))
    const bookingIds = (data ?? []).map((b) => b.id)
    const [{ data: rooms, error: roomsError }, operationalResult] = await Promise.all([
      roomIds.length
        ? sb.from('rooms').select('id, name, slug').in('id', roomIds)
        : Promise.resolve({ data: [], error: null }),
      bookingIds.length
        ? (sb as any).from('staynas_distribution_operational_reservations')
            .select('booking_id, provider_key, external_reservation_id, provider_status, integration_status, room_state_id, last_provider_event_id, last_integrated_at, last_error_code')
            .in('booking_id', bookingIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (roomsError) throw new Error(roomsError.message)
    if (operationalResult.error) throw new Error(operationalResult.error.message)
    const roomMap = new Map<string, any>((rooms ?? []).map((r: any) => [r.id, r]))
    const operationalRows: any[] = (operationalResult.data ?? []) as any[]
    const roomStateIds: string[] = Array.from(new Set<string>(operationalRows
      .map((r: any) => r.room_state_id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)))
    const { data: roomStates, error: roomStatesError } = roomStateIds.length
      ? await sb.from('room_states').select('id, unit_label, state').in('id', roomStateIds)
      : { data: [], error: null }
    if (roomStatesError) throw new Error(roomStatesError.message)
    const roomStateMap = new Map<string, any>((roomStates ?? []).map((r: any) => [r.id, r]))
    const operationalMap = new Map<string, any>(operationalRows.map((r: any) => [r.booking_id, r]))
    return (data ?? []).map((b) => {
      const operational: any = operationalMap.get(b.id) ?? null
      return {
        ...b,
        total: Number(b.total),
        balance_amount: Number(b.balance_amount),
        room: roomMap.get(b.room_id) ?? null,
        channel: operational ? {
          providerKey: operational.provider_key,
          externalReservationId: operational.external_reservation_id,
          providerStatus: operational.provider_status,
          integrationStatus: operational.integration_status,
          lastProviderEventId: operational.last_provider_event_id,
          lastIntegratedAt: operational.last_integrated_at,
          lastErrorCode: operational.last_error_code,
          assignedUnit: operational.room_state_id ? roomStateMap.get(operational.room_state_id) ?? null : null,
        } : null,
      }
    })
  })

export const getGuestThread = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, 'front-desk')
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
      status: z.enum(['confirmed', 'cancelled', 'checked_in', 'completed', 'no_show']),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, 'front-desk')
    const { data: result, error } = await context.supabase.rpc('staynas_transition_booking', {
      _booking_id: data.bookingId,
      _target_status: data.status,
      _notes: null,
    })
    if (error) throw new Error(error.message)
    return result ?? { ok: true }
  })

export const saveStaffNote = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid(), notes: z.string().max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, 'front-desk')
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
    await requireStayNasModuleAccess(context.supabase, context.userId, 'front-desk')
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
    await requireStayNasModuleAccess(context.supabase, context.userId, 'front-desk')
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