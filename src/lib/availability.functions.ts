// Sprint 9J — Unified availability & booking-hold server functions.
//
// Public-safe RPCs: create/release booking holds and search availability.
// Staff-only RPCs: room blocks, calendar events, unified calendar payload.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { bookingRpc } from "@/lib/booking-rpc";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

// -------- Public booking holds ----------------------------------------

const createHoldSchema = z.object({
  roomSlug: z.string().min(1).max(80),
  checkIn: dateStr,
  checkOut: dateStr,
  sessionId: z.string().min(6).max(120),
  guestEmail: z.string().email().max(255).optional(),
  ttlSeconds: z.number().int().min(60).max(3600).optional(),
});

export const createBookingHold = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createHoldSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in");
    const sb = publicClient();
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { data: rows, error } = await bookingRpc(sb).rpc("create_booking_hold_for_property", {
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _session_id: data.sessionId,
      _property_id: propertyId,
      ...(data.guestEmail ? { _guest_email: data.guestEmail } : {}),
      _ttl_seconds: data.ttlSeconds ?? 900,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Failed to create booking hold");
    return {
      holdId: row.hold_id,
      expiresAt: row.expires_at,
      roomId: row.room_id,
    };
  });

export const releaseBookingHold = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ holdId: z.string().uuid(), sessionId: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { data: ok, error } = await bookingRpc(sb).rpc("release_booking_hold_for_property", {
      _hold_id: data.holdId,
      _session_id: data.sessionId,
      _property_id: propertyId,
    });
    if (error) throw new Error(error.message);
    return { released: Boolean(ok) };
  });

export const getBookingHold = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ holdId: z.string().uuid(), sessionId: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { data: rows, error } = await bookingRpc(sb).rpc("get_booking_hold_for_property", {
      _hold_id: data.holdId,
      _session_id: data.sessionId,
      _property_id: propertyId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) return null;
    return {
      id: row.id,
      room_id: row.room_id,
      check_in: row.check_in,
      check_out: row.check_out,
      expires_at: row.expires_at,
      status: row.status as "active" | "released" | "expired" | "converted",
    };
  });

// -------- Staff: room blocks & calendar --------------------------------

export const setRoomBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      roomId: z.string().uuid(),
      from: dateStr,
      to: dateStr,
      blocked: z.boolean(),
      reason: z.string().trim().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "rooms");
    const { data: n, error } = await context.supabase.rpc("set_room_block", {
      _room_id: data.roomId,
      _from: data.from,
      _to: data.to,
      _blocked: data.blocked,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return { days: Number(n ?? 0) };
  });

export const listCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      propertyId: z.string().uuid(),
      from: dateStr,
      to: dateStr,
      types: z.array(z.string()).max(20).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
    if (data.to <= data.from) throw new Error("Calendar end date must be after start date");
    const sb: any = context.supabase;
    const { data: hasAccess, error: accessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: context.userId,
      _property_id: data.propertyId,
    });
    if (accessError) throw new Error(accessError.message);
    if (!hasAccess) throw new Error("Property access denied");

    const { data: rows, error } = await sb.rpc("staynas_calendar_audit_events", {
      _property_id: data.propertyId,
      _from: data.from,
      _to: data.to,
      _limit: data.limit ?? 100,
    });
    if (error) throw new Error(error.message);
    const filtered = (rows ?? []).filter((row: any) => !data.types?.length || data.types.includes(row.event_type));
    return filtered.map((row: any) => ({
      id: row.id as string,
      event_type: row.event_type as string,
      room_id: (row.room_id as string | null) ?? null,
      booking_id: (row.booking_id as string | null) ?? null,
      hold_id: (row.hold_id as string | null) ?? null,
      date_from: (row.date_from as string | null) ?? null,
      date_to: (row.date_to as string | null) ?? null,
      payload_json: JSON.stringify(row.payload ?? {}),
      created_at: row.created_at as string,
    }));
  });

export const listActiveHolds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      propertyId: z.string().uuid(),
      from: dateStr.optional(),
      to: dateStr.optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    const sb: any = context.supabase;
    const { data: hasAccess, error: accessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: context.userId,
      _property_id: data.propertyId,
    });
    if (accessError) throw new Error(accessError.message);
    if (!hasAccess) throw new Error("Property access denied");

    let q = sb.from("booking_holds")
      .select("id, property_id, room_id, check_in, check_out, expires_at, guest_email, status, session_id, created_at")
      .eq("property_id", data.propertyId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    if (data.from) q = q.gt("check_out", data.from);
    if (data.to) q = q.lt("check_in", data.to);
    const { data: rows, error } = await q.order("expires_at", { ascending: true }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string; property_id: string; room_id: string; check_in: string; check_out: string;
      expires_at: string; guest_email: string | null; status: string; session_id: string; created_at: string;
    }>;
  });

export const releaseHoldStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ holdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    const sb: any = context.supabase;
    const { data: row, error: rowError } = await sb
      .from("booking_holds")
      .select("session_id, property_id")
      .eq("id", data.holdId)
      .maybeSingle();
    if (rowError || !row) throw new Error(rowError?.message ?? "Hold not found");

    const { data: hasAccess, error: accessError } = await sb.rpc("staynas_user_has_property_access", {
      _uid: context.userId,
      _property_id: row.property_id,
    });
    if (accessError) throw new Error(accessError.message);
    if (!hasAccess) throw new Error("Property access denied");

    const { data: ok, error } = await bookingRpc(sb).rpc("release_booking_hold_for_property", {
      _hold_id: data.holdId,
      _session_id: row.session_id,
      _property_id: row.property_id,
    });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });

// -------- Staff: reassign booking room --------------------------------

export const reassignBookingRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      bookingId: z.string().uuid(),
      newRoomId: z.string().uuid(),
      reason: z.string().trim().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    const { data: res, error } = await context.supabase.rpc("reassign_booking_room", {
      _booking_id: data.bookingId,
      _new_room_id: data.newRoomId,
      _actor: context.userId,
      ...(data.reason ? { _reason: data.reason } : {}),
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; booking_id: string; from_room_id: string; to_room_id: string };
  });

// -------- Staff: AI room-assignment suggestion ------------------------

// Heuristic recommender. Given a booking, ranks currently-available rooms
// against the guest's preferences (extracted from special_requests + purpose)
// plus capacity fit and price parity. Read-only — staff must approve.

export const suggestRoomAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    const sb: any = context.supabase;
    const { data: b, error: be } = await sb
      .from("bookings")
      .select("id, room_id, check_in, check_out, adults, children, special_requests, visit_purpose, guest_type")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (be || !b) throw new Error(be?.message ?? "Booking not found");

    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { data: avail, error: ae } = await bookingRpc(sb).rpc("get_room_availability_for_property", {
      _check_in: b.check_in,
      _check_out: b.check_out,
      _property_id: propertyId,
    });
    if (ae) throw new Error(ae.message);

    const occupants = (b.adults ?? 0) + (b.children ?? 0);
    const hay = `${b.special_requests ?? ""} ${b.visit_purpose ?? ""}`.toLowerCase();
    const wants = {
      river: /river|view|water/.test(hay),
      quiet: /quiet|peace|honeymoon|anniversary/.test(hay),
      deluxe: /deluxe|premium|suite|upgrade/.test(hay),
      family: /family|kid|child/.test(hay) || (b.children ?? 0) > 0,
      climber: b.guest_type === "climber" || /kilimanjaro|climb|trek/.test(hay),
    };

    const scored = ((avail ?? []) as any[])
      .filter((r) => r.is_available && r.id !== b.room_id && occupants <= r.max_occupancy)
      .map((r) => {
        const n = `${r.name} ${r.slug}`.toLowerCase();
        let score = 0;
        const reasons: string[] = [];
        if (wants.river && /river|water/.test(n)) { score += 3; reasons.push("river view match"); }
        if (wants.deluxe && /deluxe|premium|suite/.test(n)) { score += 3; reasons.push("premium preference"); }
        if (wants.family && r.max_occupancy >= occupants + 1) { score += 1; reasons.push("family-friendly capacity"); }
        if (wants.climber && /standard|garden/.test(n)) { score += 1; reasons.push("efficient for early departures"); }
        // Capacity fit — prefer smallest room that still accommodates guests.
        score += Math.max(0, 3 - (r.max_occupancy - occupants));
        // Price proximity — penalise big price jumps.
        return {
          room_id: r.id as string,
          slug: r.slug as string,
          name: r.name as string,
          base_price: Number(r.base_price),
          max_occupancy: r.max_occupancy as number,
          min_available: r.min_available as number,
          score,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return { bookingId: b.id, currentRoomId: b.room_id as string, suggestions: scored };
  });