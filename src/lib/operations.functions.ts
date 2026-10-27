import { rankCalendarStaff } from "./calendar-scheduling-recommendations";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: prev } = await sb.from("room_states").select("state, unit_label").eq("id", data.id).maybeSingle();
    if (!prev) throw new Error("Room state not found or not accessible");
    // Use the canonical Housekeeping transition RPC so calendar changes obey
    // the same transition graph, role checks and audit/idempotency rules.
    const { error } = await sb.rpc("housekeeping_transition_room_state", {
      _room_state_id: data.id,
      _to_state: data.state,
      _note: data.note ?? null,
      _idempotency_key: `calendar-room-state:${data.id}:${data.state}:${Date.now()}`,
    });
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
      room_state_id: linkedState?.id ?? null,
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
    propertyId: z.string().uuid(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    if (data.to <= data.from) throw new Error("Calendar end date must be after start date");
    if ((Date.parse(`${data.to}T00:00:00Z`) - Date.parse(`${data.from}T00:00:00Z`)) / 86400000 > 93) throw new Error("Calendar range cannot exceed 93 days");
    const sb: any = context.supabase;
    const { data: hasAccess, error: accessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: context.userId,
      _property_id: data.propertyId,
    });
    if (accessError) throw new Error(accessError.message);
    if (!hasAccess) throw new Error("Property access denied");

    const { data: rooms, error: roomsError } = await sb
      .from("rooms")
      .select("id, slug, name, total_units")
      .eq("property_id", data.propertyId)
      .order("sort_order");
    if (roomsError) throw new Error(roomsError.message);
    const roomIds = (rooms ?? []).map((room: any) => room.id);

    const [bookingsRes, invRes, operationalRes, roomStatesRes] = await Promise.all([
      sb.from("bookings")
        .select("id, reference, guest_name, check_in, check_out, status, room_id, property_id, guest_type")
        .eq("property_id", data.propertyId)
        .in("status", ["confirmed", "checked_in", "completed"])
        .lt("check_in", data.to)
        .gt("check_out", data.from)
        .order("check_in"),
      roomIds.length
        ? sb.from("room_inventory")
            .select("room_id, date, available_units, is_blocked, price_override")
            .in("room_id", roomIds)
            .gte("date", data.from)
            .lt("date", data.to)
        : Promise.resolve({ data: [], error: null }),
      sb.rpc("staynas_calendar_operational_events", {
        _property_id: data.propertyId,
        _from: data.from,
        _to: data.to,
      }),
      roomIds.length
        ? sb.from("room_states")
            .select("id, room_id, unit_label, state, state_note, booking_id, updated_at")
            .in("room_id", roomIds)
            .order("unit_label")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (bookingsRes.error) throw new Error(bookingsRes.error.message);
    if (invRes.error) throw new Error(invRes.error.message);
    if (operationalRes.error) throw new Error(operationalRes.error.message);
    if (roomStatesRes.error) throw new Error(roomStatesRes.error.message);
    const roomById = new Map((rooms ?? []).map((room: any) => [room.id, room]));

    return {
      rooms: rooms ?? [],
      bookings: bookingsRes.data ?? [],
      inventory: invRes.data ?? [],
      operationalEvents: operationalRes.data ?? [],
      roomStates: (roomStatesRes.data ?? []).map((unit: any) => ({
        ...unit,
        room: roomById.get(unit.room_id) ?? null,
      })),
    };
  });

export const listCalendarStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: hasAccess, error: accessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: context.userId,
      _property_id: data.propertyId,
    });
    if (accessError) throw new Error(accessError.message);
    if (!hasAccess) throw new Error("Property access denied");
    const { data: canManage, error: roleError } = await sb.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["owner", "manager", "admin"],
    });
    if (roleError) throw new Error(roleError.message);
    if (!canManage) return { canManage: false, staff: [] as Array<{ user_id: string; email: string }> };
    const { data: staff, error } = await sb.rpc("staynas_calendar_list_staff", { _property_id: data.propertyId });
    if (error) throw new Error(error.message);
    return { canManage: true, staff: (staff ?? []) as Array<{ user_id: string; email: string }> };
  });

export const createCalendarStaffSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    propertyId: z.string().uuid(),
    staffUserId: z.string().uuid(),
    title: z.string().trim().min(2).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    notes: z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    if (Date.parse(data.endsAt) <= Date.parse(data.startsAt)) {
      throw new Error("Schedule end must be after its start");
    }
    const sb: any = context.supabase;
    const { data: canManage, error: roleError } = await sb.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["owner", "manager", "admin"],
    });
    if (roleError) throw new Error(roleError.message);
    if (!canManage) throw new Error("Only property managers can schedule staff");
    const { data: hasAccess, error: accessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: context.userId,
      _property_id: data.propertyId,
    });
    if (accessError) throw new Error(accessError.message);
    if (!hasAccess) throw new Error("Property access denied");

    const { data: row, error } = await sb.from("staynas_staff_schedules").insert({
      property_id: data.propertyId,
      staff_user_id: data.staffUserId,
      title: data.title,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      notes: data.notes?.trim() || null,
      created_by: context.userId,
    }).select("id, staff_user_id, title, starts_at, ends_at, status, notes").single();
    if (error) throw new Error(error.message);
    return row;
  });

// -------------------------------------------------------------- Recurring calendar schedules (Phase 3)

const recurringScheduleSchema = z.object({
  propertyId: z.string().uuid(),
  staffUserId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  notes: z.string().max(1000).optional(),
  timezone: z.string().min(3).max(100),
  startsOn: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  endsOn: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  localStart: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  localEnd: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  frequency: z.enum(["daily", "weekly"]),
  intervalCount: z.number().int().min(1).max(12),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
}).superRefine((value, ctx) => {
  if (value.localEnd <= value.localStart) ctx.addIssue({ code: "custom", path: ["localEnd"], message: "End time must be after start time" });
  if (value.endsOn && value.endsOn < value.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "End date must be on or after start date" });
  if (value.frequency === "weekly" && value.daysOfWeek.length === 0) ctx.addIssue({ code: "custom", path: ["daysOfWeek"], message: "Choose at least one weekday" });
  if (value.frequency === "daily" && value.daysOfWeek.length > 0) ctx.addIssue({ code: "custom", path: ["daysOfWeek"], message: "Daily schedules must not include weekday filters" });
});

export const createRecurringCalendarSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recurringScheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: canManage, error: roleError }, { data: hasAccess, error: accessError }] = await Promise.all([
      sb.rpc("has_any_role", { _user_id: context.userId, _roles: ["owner", "manager", "admin"] }),
      sb.rpc("staynas_user_has_property_access", { _uid: context.userId, _property_id: data.propertyId }),
    ]);
    if (roleError) throw new Error(roleError.message);
    if (accessError) throw new Error(accessError.message);
    if (!canManage) throw new Error("Only property managers can create recurring schedules");
    if (!hasAccess) throw new Error("Property access denied");
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("timezone,status").eq("id", data.propertyId).maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property || property.status !== "active") throw new Error("Active property not found");
    if (property.timezone !== data.timezone) throw new Error("Schedule timezone must match the selected property timezone");
    const { data: staffHasAccess, error: staffAccessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: data.staffUserId, _property_id: data.propertyId,
    });
    if (staffAccessError) throw new Error(staffAccessError.message);
    if (!staffHasAccess) throw new Error("Selected staff member is not assigned to this property");
    const { data: row, error } = await sb.from("staynas_calendar_schedule_series").insert({
      property_id: data.propertyId,
      staff_user_id: data.staffUserId,
      title: data.title,
      notes: data.notes?.trim() || null,
      timezone: data.timezone,
      starts_on: data.startsOn,
      ends_on: data.endsOn || null,
      local_start: data.localStart,
      local_end: data.localEnd,
      frequency: data.frequency,
      interval_count: data.intervalCount,
      days_of_week: data.daysOfWeek,
      created_by: context.userId,
    }).select("id,property_id,staff_user_id,title,timezone,starts_on,ends_on,local_start,local_end,frequency,interval_count,days_of_week,status").single();
    if (error) throw new Error(error.message);
    await logOpsEvent(sb, context.userId, context.claims, {
      type: "calendar_recurring_schedule_created",
      module: "operations",
      entityType: "calendar_schedule_series",
      entityId: row.id,
      entityLabel: row.title,
      meta: { property_id: data.propertyId, staff_user_id: data.staffUserId, frequency: data.frequency },
      severity: "audit",
    });
    return row;
  });

export const getRecurringCalendarOccurrences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    propertyId: z.string().uuid(),
    from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
    to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("staynas_calendar_recurring_occurrences", {
      _property_id: data.propertyId, _from: data.from, _to: data.to,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveRecurringCalendarException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    propertyId: z.string().uuid(),
    seriesId: z.string().uuid(),
    occurrenceDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
    exceptionType: z.enum(["cancelled", "override"]),
    title: z.string().trim().min(2).max(160).optional(),
    notes: z.string().max(1000).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  }).superRefine((value, ctx) => {
    if (value.exceptionType === "override" && (!value.startsAt || !value.endsAt || Date.parse(value.endsAt) <= Date.parse(value.startsAt))) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "An override requires a valid start and end" });
    }
    if (value.exceptionType === "cancelled" && (value.startsAt || value.endsAt)) {
      ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Cancelled occurrences cannot have replacement times" });
    }
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: canManage, error: roleError }, { data: hasAccess, error: accessError }] = await Promise.all([
      sb.rpc("has_any_role", { _user_id: context.userId, _roles: ["owner", "manager", "admin"] }),
      sb.rpc("staynas_user_has_property_access", { _uid: context.userId, _property_id: data.propertyId }),
    ]);
    if (roleError) throw new Error(roleError.message);
    if (accessError) throw new Error(accessError.message);
    if (!canManage) throw new Error("Only property managers can change recurring occurrences");
    if (!hasAccess) throw new Error("Property access denied");
    const { data: series, error: seriesError } = await sb.from("staynas_calendar_schedule_series")
      .select("id,property_id,starts_on,ends_on,status").eq("id", data.seriesId).eq("property_id", data.propertyId).maybeSingle();
    if (seriesError) throw new Error(seriesError.message);
    if (!series || series.status !== "active") throw new Error("Active recurring schedule not found");
    if (data.occurrenceDate < series.starts_on || (series.ends_on && data.occurrenceDate > series.ends_on)) {
      throw new Error("Occurrence date is outside this recurring schedule");
    }
    const { data: row, error } = await sb.from("staynas_calendar_schedule_exceptions").upsert({
      series_id: data.seriesId,
      occurrence_date: data.occurrenceDate,
      exception_type: data.exceptionType,
      title: data.exceptionType === "override" ? data.title?.trim() || null : null,
      notes: data.notes?.trim() || null,
      starts_at: data.exceptionType === "override" ? data.startsAt : null,
      ends_at: data.exceptionType === "override" ? data.endsAt : null,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "series_id,occurrence_date" })
      .select("id,series_id,occurrence_date,exception_type,title,notes,starts_at,ends_at").single();
    if (error) throw new Error(error.message);
    await logOpsEvent(sb, context.userId, context.claims, {
      type: "calendar_recurring_exception_saved",
      module: "operations",
      entityType: "calendar_schedule_exception",
      entityId: row.id,
      entityLabel: data.occurrenceDate,
      meta: { property_id: data.propertyId, series_id: data.seriesId, exception_type: data.exceptionType },
      severity: "audit",
    });
    return row;
  });

export const saveCalendarRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    propertyId: z.string().uuid(),
    ruleKey: z.enum([
      "booking_lead_time", "blackout_windows", "staff_conflict_policy",
      "maintenance_buffer_minutes", "housekeeping_turnaround_minutes", "notification_preferences",
    ]),
    config: z.record(z.string(), z.unknown()),
    enabled: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: canManage, error: roleError }, { data: hasAccess, error: accessError }] = await Promise.all([
      sb.rpc("has_any_role", { _user_id: context.userId, _roles: ["owner", "manager", "admin"] }),
      sb.rpc("staynas_user_has_property_access", { _uid: context.userId, _property_id: data.propertyId }),
    ]);
    if (roleError) throw new Error(roleError.message);
    if (accessError) throw new Error(accessError.message);
    if (!canManage) throw new Error("Only property managers can configure calendar rules");
    if (!hasAccess) throw new Error("Property access denied");

    const config = data.config as Record<string, unknown>;
    const isIntegerInRange = (key: string, min: number, max: number) =>
      Number.isInteger(config[key]) && Number(config[key]) >= min && Number(config[key]) <= max;
    if (data.ruleKey === "booking_lead_time" && !isIntegerInRange("minutes", 0, 525600)) {
      throw new Error("Booking lead time requires minutes between 0 and 525600");
    }
    if (data.ruleKey === "maintenance_buffer_minutes" && !isIntegerInRange("minutes", 0, 10080)) {
      throw new Error("Maintenance buffer requires minutes between 0 and 10080");
    }
    if (data.ruleKey === "housekeeping_turnaround_minutes" && !isIntegerInRange("minutes", 0, 1440)) {
      throw new Error("Housekeeping turnaround requires minutes between 0 and 1440");
    }
    if (data.ruleKey === "staff_conflict_policy" && !["warn", "prevent"].includes(String(config.policy))) {
      throw new Error("Staff conflict policy must be warn or prevent");
    }
    if (data.ruleKey === "blackout_windows" && (!Array.isArray(config.windows) || config.windows.length > 100)) {
      throw new Error("Blackout windows must be an array containing at most 100 entries");
    }
    if (data.ruleKey === "notification_preferences" &&
      (typeof config.email !== "boolean" || typeof config.inApp !== "boolean")) {
      throw new Error("Notification preferences require email and inApp boolean values");
    }

    const { data: row, error } = await sb.from("staynas_calendar_rules").upsert({
      property_id: data.propertyId,
      rule_key: data.ruleKey,
      config: data.config,
      enabled: data.enabled,
      created_by: context.userId,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id,rule_key" })
      .select("id,property_id,rule_key,config,enabled,created_at,updated_at").single();
    if (error) throw new Error(error.message);
    await logOpsEvent(sb, context.userId, context.claims, {
      type: "calendar_rule_saved",
      module: "operations",
      entityType: "calendar_rule",
      entityId: row.id,
      entityLabel: data.ruleKey,
      meta: { property_id: data.propertyId, rule_key: data.ruleKey, enabled: data.enabled },
      severity: "audit",
    });
    return row;
  });

// -------------------------------------------------------------- Alerts

export const refreshOpsAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
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

const schedulingRecommendationSchema = z.object({
  propertyId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
  message: "End time must be after start time",
  path: ["endsAt"],
});

export const recommendCalendarStaffAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schedulingRecommendationSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [{ data: canManage, error: roleError }, { data: hasAccess, error: accessError }] = await Promise.all([
      sb.rpc("has_any_role", { _user_id: context.userId, _roles: ["owner", "manager", "admin"] }),
      sb.rpc("staynas_user_has_property_access", { _uid: context.userId, _property_id: data.propertyId }),
    ]);
    if (roleError) throw new Error(roleError.message);
    if (accessError) throw new Error(accessError.message);
    if (!canManage) throw new Error("Only property managers can request staff assignment recommendations");
    if (!hasAccess) throw new Error("Property access denied");

    const from = data.startsAt.slice(0, 10);
    const endDate = new Date(Date.parse(data.endsAt) + 86400000).toISOString().slice(0, 10);
    const [{ data: staff, error: staffError }, { data: events, error: eventsError }] = await Promise.all([
      sb.rpc("staynas_calendar_list_staff", { _property_id: data.propertyId }),
      sb.rpc("staynas_calendar_operational_events", {
        _property_id: data.propertyId, _from: from, _to: endDate,
      }),
    ]);
    if (staffError) throw new Error(staffError.message);
    if (eventsError) throw new Error(eventsError.message);
    const recommendations = rankCalendarStaff(staff ?? [], events ?? [], data.startsAt, data.endsAt);
    return {
      propertyId: data.propertyId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      advisoryOnly: true,
      requiresConflictRevalidationBeforeSave: true,
      recommendations,
    };
  });
