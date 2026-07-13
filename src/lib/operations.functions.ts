import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function logOpsEvent(
  supabase: any,
  userId: string,
  claims: any,
  event: {
    type: string;
    module?: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    meta?: Record<string, unknown>;
    severity?: "info" | "warn" | "error" | "audit";
  },
) {
  try {
    await supabase.from("activity_logs").insert({
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: event.type,
      entity_type: event.entityType,
      entity_id: event.entityId ?? null,
      entity_label: event.entityLabel ?? null,
      metadata: { ...(event.meta ?? {}), event_type: event.type },
      module: event.module ?? "operations",
      severity: event.severity ?? "info",
    });
  } catch (err) {
    console.warn("[ops] activity log failed", err);
  }
}

// -------------------------------------------------------------- Dashboard

export const getOpsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const today = new Date().toISOString().slice(0, 10);

    const [todayRow, arrivalsRes, departuresRes, inHouseRes, outstandingRes, roomStatesRes] = await Promise.all([
      sb.from("ops_today").select("*").maybeSingle(),
      sb.from("bookings")
        .select("id, reference, guest_name, guest_id, check_in, check_out, status, adults, children, total, balance_amount, currency, room_id")
        .eq("check_in", today).in("status", ["confirmed", "checked_in"]).order("guest_name"),
      sb.from("bookings")
        .select("id, reference, guest_name, guest_id, check_in, check_out, status, total, balance_amount, currency, room_id")
        .eq("check_out", today).in("status", ["checked_in", "completed"]).order("guest_name"),
      sb.from("bookings")
        .select("id, reference, guest_name, guest_id, check_in, check_out, status, room_id")
        .eq("status", "checked_in").order("check_out"),
      sb.from("ops_outstanding_balances").select("*").limit(50),
      sb.from("room_states").select("id, room_id, unit_label, state").order("unit_label"),
    ]);

    const roomStates = (roomStatesRes.data ?? []) as any[];
    const totalRooms = roomStates.length;
    const occupied = roomStates.filter((r) => r.state === "occupied").length;
    const occupancy = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    return {
      today: todayRow.data ?? {
        arrivals: 0, departures: 0, in_house: 0, pending_check_in: 0, pending_check_out: 0,
        dirty_rooms: 0, maintenance_rooms: 0, vacant_rooms: 0, occupied_rooms: 0, outstanding_total: 0,
      },
      occupancyPct: occupancy,
      totalRooms,
      arrivals: arrivalsRes.data ?? [],
      departures: departuresRes.data ?? [],
      inHouse: inHouseRes.data ?? [],
      outstanding: (outstandingRes.data ?? []).map((r: any) => ({ ...r, balance_amount: Number(r.balance_amount ?? 0), total: Number(r.total ?? 0) })),
    };
  });

// -------------------------------------------------------------- Room board

export const getRoomBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [statesRes, roomsRes, bookingsRes] = await Promise.all([
      sb.from("room_states").select("id, room_id, unit_label, state, state_note, booking_id, updated_at").order("unit_label"),
      sb.from("rooms").select("id, slug, name").order("sort_order"),
      sb.from("bookings")
        .select("id, reference, guest_name, check_in, check_out, status, room_id")
        .in("status", ["confirmed", "checked_in"])
        .lte("check_in", new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)),
    ]);
    const rooms = new Map<string, any>((roomsRes.data ?? []).map((r: any) => [r.id, r]));
    return {
      rooms: roomsRes.data ?? [],
      states: (statesRes.data ?? []).map((s: any) => ({
        ...s,
        room: rooms.get(s.room_id),
      })),
      upcomingBookings: bookingsRes.data ?? [],
    };
  });

const roomStateSchema = z.object({
  id: z.string().uuid(),
  state: z.enum(["vacant_clean","vacant_dirty","occupied","reserved","inspection","maintenance","out_of_service"]),
  note: z.string().max(500).optional(),
});

export const updateRoomState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roomStateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: prev } = await sb.from("room_states").select("state, unit_label").eq("id", data.id).maybeSingle();
    const { error } = await sb.from("room_states")
      .update({ state: data.state, state_note: data.note ?? null, updated_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logOpsEvent(sb, context.userId, context.claims, {
      type: "room.state_changed",
      entityType: "room_state",
      entityId: data.id,
      entityLabel: prev?.unit_label,
      meta: { from: prev?.state, to: data.state },
    });
    return { ok: true };
  });

// -------------------------------------------------------------- Reservation workspace

export const getReservationWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: booking, error } = await sb
      .from("bookings")
      .select("*, room:rooms(id, slug, name, base_price, currency), guest:guests(id, full_name, email, phone_e164, country, status, total_stays, lifetime_spend, ai_summary, marketing_consent)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Reservation not found");

    const [nightsRes, extrasRes, paymentsRes, tasksRes, notesRes, roomStatesRes] = await Promise.all([
      sb.from("booking_nights").select("date, nightly_rate").eq("booking_id", data.id).order("date"),
      sb.from("booking_extras").select("id, quantity, unit_price, line_total, extra:extras(id, slug, name, unit)").eq("booking_id", data.id),
      sb.from("payment_events").select("*").eq("booking_id", data.id).order("created_at", { ascending: false }),
      sb.from("ops_tasks").select("*").eq("booking_id", data.id).order("due_at", { nullsFirst: false }),
      booking.guest_id
        ? sb.from("guest_notes").select("*").eq("guest_id", booking.guest_id).order("created_at", { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      sb.from("room_states").select("id, unit_label, state").eq("room_id", booking.room_id).order("unit_label"),
    ]);

    return {
      booking: {
        ...booking,
        total: Number(booking.total ?? 0),
        balance_amount: Number(booking.balance_amount ?? 0),
        deposit_amount: Number(booking.deposit_amount ?? 0),
      },
      nights: nightsRes.data ?? [],
      extras: extrasRes.data ?? [],
      payments: paymentsRes.data ?? [],
      tasks: tasksRes.data ?? [],
      notes: notesRes.data ?? [],
      roomStates: roomStatesRes.data ?? [],
    };
  });

// -------------------------------------------------------------- Check in / out

const checkInSchema = z.object({
  bookingId: z.string().uuid(),
  roomStateId: z.string().uuid().optional(),
  arrivalTime: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const checkInBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkInSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: booking, error } = await sb
      .from("bookings").select("id, reference, guest_name, status").eq("id", data.bookingId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Reservation not found");

    const notes = data.notes ? `[check-in ${new Date().toISOString()}] ${data.notes}` : null;
    const { error: bErr } = await sb.from("bookings")
      .update({
        status: "checked_in",
        notes: notes ?? undefined,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", data.bookingId);
    if (bErr) throw new Error(bErr.message);

    if (data.roomStateId) {
      await sb.from("room_states")
        .update({ state: "occupied", booking_id: data.bookingId, updated_by: context.userId })
        .eq("id", data.roomStateId);
    }

    await logOpsEvent(sb, context.userId, context.claims, {
      type: "reservation.checked_in",
      module: "operations",
      entityType: "booking",
      entityId: data.bookingId,
      entityLabel: booking.reference,
      severity: "audit",
      meta: { arrival_time: data.arrivalTime, notes: data.notes ?? null },
    });
    return { ok: true };
  });

const checkOutSchema = z.object({
  bookingId: z.string().uuid(),
  departureTime: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const checkOutBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkOutSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: booking } = await sb.from("bookings")
      .select("id, reference, guest_name, room_id").eq("id", data.bookingId).maybeSingle();
    if (!booking) throw new Error("Reservation not found");

    const { error } = await sb.from("bookings")
      .update({ status: "completed" })
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);

    // Flip the assigned room to vacant_dirty and queue a housekeeping task.
    const { data: linkedState } = await sb.from("room_states")
      .select("id, unit_label").eq("booking_id", data.bookingId).maybeSingle();
    if (linkedState) {
      await sb.from("room_states")
        .update({ state: "vacant_dirty", booking_id: null, updated_by: context.userId })
        .eq("id", linkedState.id);
    }

    await sb.from("ops_tasks").insert({
      booking_id: data.bookingId,
      task_type: "housekeeping",
      category: "housekeeping",
      title: `Clean ${linkedState?.unit_label ?? "room"} after ${booking.guest_name}`,
      priority: 2,
      status: "pending",
      due_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    });

    await logOpsEvent(sb, context.userId, context.claims, {
      type: "reservation.checked_out",
      module: "operations",
      entityType: "booking",
      entityId: data.bookingId,
      entityLabel: booking.reference,
      severity: "audit",
      meta: { departure_time: data.departureTime, notes: data.notes ?? null },
    });
    // TODO: queue post-stay review request (future automation)
    return { ok: true };
  });

// -------------------------------------------------------------- Calendar

export const getOpsCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [roomsRes, bookingsRes, invRes] = await Promise.all([
      sb.from("rooms").select("id, slug, name, total_units").order("sort_order"),
      sb.from("bookings")
        .select("id, reference, guest_name, check_in, check_out, status, room_id")
        .in("status", ["confirmed", "checked_in", "completed"])
        .lte("check_in", data.to)
        .gte("check_out", data.from)
        .order("check_in"),
      sb.from("room_inventory")
        .select("room_id, date, available_units, is_blocked, price_override")
        .gte("date", data.from).lte("date", data.to),
    ]);
    return {
      rooms: roomsRes.data ?? [],
      bookings: bookingsRes.data ?? [],
      inventory: invRes.data ?? [],
      // TODO: drag-and-drop reassignment (future sprint)
    };
  });

// -------------------------------------------------------------- Alerts

export const refreshOpsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const today = new Date().toISOString().slice(0, 10);
    const inserts: any[] = [];

    const { data: late } = await sb.from("bookings")
      .select("id, reference, guest_name, check_in, room_id")
      .lt("check_in", today).eq("status", "confirmed").limit(100);
    for (const b of late ?? []) {
      inserts.push({ kind: "late_arrival", severity: "warn", booking_id: b.id, room_id: b.room_id,
        message: `${b.guest_name} (${b.reference}) was expected on ${b.check_in} but has not checked in.` });
    }

    const { data: overdue } = await sb.from("bookings")
      .select("id, reference, guest_name, check_out, room_id")
      .lt("check_out", today).eq("status", "checked_in").limit(100);
    for (const b of overdue ?? []) {
      inserts.push({ kind: "overdue_departure", severity: "warn", booking_id: b.id, room_id: b.room_id,
        message: `${b.guest_name} (${b.reference}) was due to check out on ${b.check_out}.` });
    }

    const { data: unpaid } = await sb.from("bookings")
      .select("id, reference, guest_name, balance_amount, currency, room_id")
      .gt("balance_amount", 0).lte("check_in", today).not("status", "in", "(cancelled,completed)").limit(100);
    for (const b of unpaid ?? []) {
      inserts.push({ kind: "payment_issue", severity: "warn", booking_id: b.id, room_id: b.room_id,
        message: `${b.guest_name} (${b.reference}) has an outstanding balance of ${b.currency} ${b.balance_amount}.` });
    }

    // Wipe unresolved auto-generated alerts and re-seed. Small volume, keeps it simple.
    await sb.from("ops_alerts").delete().is("resolved_at", null);
    if (inserts.length > 0) await sb.from("ops_alerts").insert(inserts);
    return { count: inserts.length };
  });

export const listOpsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ includeResolved: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    let q = sb.from("ops_alerts").select("*, booking:bookings(id, reference, guest_name, guest_id)").order("created_at", { ascending: false }).limit(200);
    if (!data.includeResolved) q = q.is("resolved_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resolveOpsAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb.from("ops_alerts")
      .update({ resolved_at: new Date().toISOString(), resolved_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logOpsEvent(sb, context.userId, context.claims, {
      type: "ops.alert_resolved", entityType: "ops_alert", entityId: data.id,
    });
    return { ok: true };
  });

// -------------------------------------------------------------- Timeline

export const getOpsTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(80) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rows, error } = await sb.from("activity_logs")
      .select("id, action, entity_type, entity_id, entity_label, metadata, module, severity, actor_email, created_at")
      .in("module", ["operations", "reservations", "guests", "finance"])
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });