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
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const { data: property, error: currencyError } = await sb.from("staynas_properties").select("currency").eq("id", propertyId).single();
    const currency = String(property?.currency ?? "").trim().toUpperCase();
    if (currencyError || !/^[A-Z]{3}$/.test(currency)) throw new Error("The active property must have a valid operating currency before the operations dashboard can display financial balances.");

    const [bookingsRes, roomStatesRes] = await Promise.all([
      sb.from("bookings")
        .select("id, reference, guest_name, guest_id, check_in, check_out, status, adults, children, total, balance_amount, currency, room_id")
        .eq("property_id", propertyId),
      sb.from("room_states").select("id, room_id, unit_label, state").eq("property_id", propertyId).order("unit_label"),
    ]);
    if (bookingsRes.error || roomStatesRes.error) throw new Error(bookingsRes.error?.message ?? roomStatesRes.error?.message);
    const bookings = (bookingsRes.data ?? []) as any[];
    const arrivals = bookings.filter((b) => b.check_in === today && ["confirmed", "checked_in"].includes(b.status)).sort((a,b) => String(a.guest_name ?? "").localeCompare(String(b.guest_name ?? "")));
    const departures = bookings.filter((b) => b.check_out === today && ["checked_in", "completed"].includes(b.status)).sort((a,b) => String(a.guest_name ?? "").localeCompare(String(b.guest_name ?? "")));
    const inHouse = bookings.filter((b) => b.status === "checked_in").sort((a,b) => String(a.check_out ?? "").localeCompare(String(b.check_out ?? "")));
    const outstanding = bookings.filter((b) => Number(b.balance_amount ?? 0) > 0 && b.status !== "cancelled");
    const outstandingByCurrency = new Map<string, number>();
    for (const booking of outstanding) {
      const code = String(booking.currency ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      outstandingByCurrency.set(code, (outstandingByCurrency.get(code) ?? 0) + Number(booking.balance_amount ?? 0));
    }
    const roomStates = (roomStatesRes.data ?? []) as any[];
    const totalRooms = roomStates.length;
    const occupied = roomStates.filter((r) => r.state === "occupied").length;
    const occupancy = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;

    return {
      propertyId,
      currency,
      today: {
        arrivals: arrivals.length,
        departures: departures.length,
        in_house: inHouse.length,
        pending_check_in: bookings.filter((b) => b.check_in === today && b.status === "confirmed").length,
        pending_check_out: departures.filter((b) => b.status === "checked_in").length,
        dirty_rooms: roomStates.filter((r) => r.state === "vacant_dirty").length,
        maintenance_rooms: roomStates.filter((r) => ["maintenance", "out_of_service"].includes(r.state)).length,
        vacant_rooms: roomStates.filter((r) => r.state === "vacant_clean").length,
        occupied_rooms: occupied,
        outstanding_total: outstandingByCurrency.get(currency) ?? 0,
        outstanding_by_currency: Object.fromEntries([...outstandingByCurrency.entries()].sort(([a],[b]) => a.localeCompare(b))),
      },
      occupancyPct: occupancy,
      totalRooms,
      arrivals,
      departures,
      inHouse,
      outstanding: outstanding.map((r: any) => ({ ...r, balance_amount: Number(r.balance_amount ?? 0), total: Number(r.total ?? 0) })),
    };
  });

// -------------------------------------------------------------- Room board

export const getRoomBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const [statesRes, roomsRes, bookingsRes] = await Promise.all([
      sb.from("room_states").select("id, room_id, unit_label, state, state_note, booking_id, updated_at").eq("property_id", propertyId).order("unit_label"),
      sb.from("rooms").select("id, slug, name, total_units, configuration_source").eq("property_id", propertyId).order("sort_order"),
      sb.from("bookings")
        .select("id, reference, guest_name, check_in, check_out, status, room_id")
        .eq("property_id", propertyId)
        .in("status", ["confirmed", "checked_in"])
        .lte("check_in", new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)),
    ]);
    const failed = [statesRes, roomsRes, bookingsRes].find((result) => result.error);
    if (failed?.error) throw new Error(`Room Board data load failed: ${failed.error.message}`);
    const rooms = new Map<string, any>((roomsRes.data ?? []).map((r: any) => [r.id, r]));
    const states = (statesRes.data ?? []) as any[];
    const orphanedStates = states.filter((state) => !rooms.has(state.room_id));
    if (orphanedStates.length) {
      throw new Error("Room Board inventory integrity failure: physical room units reference missing or inactive room definitions.");
    }
    const physicalCounts = new Map<string, number>();
    for (const state of states) physicalCounts.set(state.room_id, (physicalCounts.get(state.room_id) ?? 0) + 1);
    const roomTypes = (roomsRes.data ?? []).map((room: any) => {
      const configuredUnits = Number(room.total_units ?? 0);
      const physicalUnits = physicalCounts.get(room.id) ?? 0;
      return { ...room, configured_units: configuredUnits, physical_units: physicalUnits, inventory_synced: configuredUnits === physicalUnits };
    });
    return {
      propertyId,
      rooms: roomsRes.data ?? [],
      roomTypes,
      inventoryIntegrity: {
        configuredUnits: roomTypes.reduce((sum: number, room: any) => sum + room.configured_units, 0),
        physicalUnits: roomTypes.reduce((sum: number, room: any) => sum + room.physical_units, 0),
        mismatches: roomTypes.filter((room: any) => !room.inventory_synced).length,
      },
      states: states.map((s: any) => ({ ...s, room: rooms.get(s.room_id) })),
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
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const housekeepingStates = new Set(["vacant_dirty", "inspection", "vacant_clean", "maintenance", "out_of_service"]);
    if (housekeepingStates.has(data.state)) {
      throw new Error("Housekeeping room-readiness states must be changed through the governed Housekeeping workflow.");
    }
    const { data: prev } = await sb.from("room_states").select("state, unit_label").eq("id", data.id).eq("property_id", propertyId).maybeSingle();
    const { error } = await sb.from("room_states")
      .update({ state: data.state, state_note: data.note ?? null, updated_by: context.userId })
      .eq("id", data.id).eq("property_id", propertyId);
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
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const { data: booking, error } = await sb
      .from("bookings")
      .select("*, room:rooms(id, slug, name, base_price, currency), guest:guests(id, full_name, email, phone_e164, country, status, ai_summary, marketing_consent)")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Reservation not found");

    const [nightsRes, extrasRes, paymentsRes, tasksRes, notesRes, roomStatesRes, guestStatsRes] = await Promise.all([
      sb.from("booking_nights").select("date, nightly_rate").eq("booking_id", data.id).order("date"),
      sb.from("booking_extras").select("id, quantity, unit_price, line_total, extra:extras(id, slug, name, unit)").eq("booking_id", data.id),
      sb.from("payment_events").select("*").eq("booking_id", data.id).order("created_at", { ascending: false }),
      sb.from("ops_tasks").select("*").eq("booking_id", data.id).order("due_at", { nullsFirst: false }),
      booking.guest_id
        ? sb.from("guest_notes").select("*").eq("guest_id", booking.guest_id).order("created_at", { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
      sb.from("room_states").select("id, unit_label, state").eq("room_id", booking.room_id).order("unit_label"),
      booking.guest_id
        ? sb.from("guest_directory").select("total_stays, lifetime_spend, lifetime_spend_currency, lifetime_spend_by_currency").eq("id", booking.guest_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      booking: {
        ...booking,
        guest: booking.guest ? {
          ...booking.guest,
          total_stays: Number(guestStatsRes.data?.total_stays ?? 0),
          lifetime_spend: guestStatsRes.data?.lifetime_spend == null ? null : Number(guestStatsRes.data.lifetime_spend),
          lifetime_spend_currency: guestStatsRes.data?.lifetime_spend_currency ?? null,
          lifetime_spend_by_currency: guestStatsRes.data?.lifetime_spend_by_currency ?? {},
        } : null,
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
    const { data: result, error } = await context.supabase.rpc("staynas_transition_booking", {
      _booking_id: data.bookingId,
      _target_status: "checked_in",
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    let guestPortalAccess: { issued: boolean; alreadyActive: boolean; expiresAt: string | null; token: string | null; accessId: string; error?: string } = {
      issued: false,
      alreadyActive: false,
      expiresAt: null,
      token: null,
      accessId: "",
    };
    try {
      const { ensureGuestPortalAccessAfterCheckIn } = await import(
        "@/domains/hospitality/guest-portal/guest-portal-access.server"
      );
      guestPortalAccess = await ensureGuestPortalAccessAfterCheckIn(
        context.supabase,
        context.userId,
        data.bookingId,
      );
    } catch {
      guestPortalAccess = {
        issued: false,
        alreadyActive: false,
        expiresAt: null,
        token: null,
        accessId: "",
        error: "Check-in succeeded, but Guest Portal access issuance failed. Retry from the reservation access panel.",
      };
    }
    return { ...(result !== null && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : { ok: true }), guestPortalAccess };
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
    const { data: result, error } = await context.supabase.rpc("staynas_transition_booking", {
      _booking_id: data.bookingId,
      _target_status: "completed",
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return result ?? { ok: true };
  });

// -------------------------------------------------------------- Calendar

export const getOpsCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const [roomsRes, bookingsRes] = await Promise.all([
      sb.from("rooms").select("id, slug, name, total_units").eq("property_id", propertyId).order("sort_order"),
      sb.from("bookings")
        .select("id, reference, guest_name, guest_type, check_in, check_out, status, room_id")
        .eq("property_id", propertyId)
        .in("status", ["pending", "confirmed", "checked_in", "completed"])
        .lte("check_in", data.to)
        .gte("check_out", data.from)
        .order("check_in"),
    ]);
    const failed = [roomsRes, bookingsRes].find((result) => result.error);
    if (failed?.error) throw new Error(`Calendar data load failed: ${failed.error.message}`);
    const roomIds = (roomsRes.data ?? []).map((room: any) => room.id);
    const invRes = roomIds.length
      ? await sb.from("room_inventory").select("room_id, date, available_units, is_blocked, price_override")
          .in("room_id", roomIds).gte("date", data.from).lt("date", data.to)
      : { data: [], error: null };
    if (invRes.error) throw new Error(`Calendar inventory load failed: ${invRes.error.message}`);
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
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "No active property selected");
    const today = new Date().toISOString().slice(0, 10);
    const inserts: any[] = [];

    const { data: late } = await sb.from("bookings")
      .select("id, reference, guest_name, check_in, room_id")
      .eq("property_id", propertyId)
      .lt("check_in", today).eq("status", "confirmed").limit(100);
    for (const b of late ?? []) {
      inserts.push({ kind: "late_arrival", severity: "warn", booking_id: b.id, room_id: b.room_id,
        message: `${b.guest_name} (${b.reference}) was expected on ${b.check_in} but has not checked in.`, property_id: propertyId });
    }

    const { data: overdue } = await sb.from("bookings")
      .select("id, reference, guest_name, check_out, room_id")
      .eq("property_id", propertyId)
      .lt("check_out", today).eq("status", "checked_in").limit(100);
    for (const b of overdue ?? []) {
      inserts.push({ kind: "overdue_departure", severity: "warn", booking_id: b.id, room_id: b.room_id,
        message: `${b.guest_name} (${b.reference}) was due to check out on ${b.check_out}.`, property_id: propertyId });
    }

    const { data: unpaid } = await sb.from("bookings")
      .select("id, reference, guest_name, balance_amount, currency, room_id")
      .eq("property_id", propertyId)
      .gt("balance_amount", 0).lte("check_in", today).not("status", "in", "(cancelled,completed)").limit(100);
    for (const b of unpaid ?? []) {
      inserts.push({ kind: "payment_issue", severity: "warn", booking_id: b.id, room_id: b.room_id,
        message: `${b.guest_name} (${b.reference}) has an outstanding balance of ${b.currency} ${b.balance_amount}.`, property_id: propertyId });
    }

    // Wipe unresolved auto-generated alerts and re-seed. Small volume, keeps it simple.
    await sb.from("ops_alerts").delete().eq("property_id", propertyId).is("resolved_at", null);
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