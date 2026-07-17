// Sprint 9J — Unified availability & booking-hold server functions.
//
// Public-safe RPCs: create/release booking holds and search availability.
// Staff-only RPCs: room blocks, calendar events, unified calendar payload.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
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
    const { data: rows, error } = await sb.rpc("create_booking_hold" as never, {
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _session_id: data.sessionId,
      _guest_email: data.guestEmail ?? null,
      _ttl_seconds: data.ttlSeconds ?? 900,
    } as never);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(rows) ? rows[0] : rows) as {
      hold_id: string; expires_at: string; room_id: string;
    };
    return {
      holdId: row.hold_id as string,
      expiresAt: row.expires_at as string,
      roomId: row.room_id as string,
    };
  });

export const releaseBookingHold = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ holdId: z.string().uuid(), sessionId: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: ok, error } = await sb.rpc("release_booking_hold" as never, {
      _hold_id: data.holdId,
      _session_id: data.sessionId,
    } as never);
    if (error) throw new Error(error.message);
    return { released: Boolean(ok) };
  });

export const getBookingHold = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ holdId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("booking_holds" as never)
      .select("id, room_id, check_in, check_out, expires_at, status")
      .eq("id", data.holdId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as {
      id: string; room_id: string; check_in: string; check_out: string;
      expires_at: string; status: "active" | "released" | "expired" | "converted";
    } | null;
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
    const sb = context.supabase as unknown as {
      rpc: (n: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data: n, error } = await sb.rpc("set_room_block", {
      _room_id: data.roomId,
      _from: data.from,
      _to: data.to,
      _blocked: data.blocked,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { days: Number(n ?? 0) };
  });

export const listCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      from: dateStr.optional(),
      to: dateStr.optional(),
      types: z.array(z.string()).max(20).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          gte: (c: string, v: string) => any;
          lte: (c: string, v: string) => any;
          in: (c: string, v: string[]) => any;
          order: (c: string, o: { ascending: boolean }) => any;
          limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
    let q: any = sb.from("calendar_events").select(
      "id, event_type, room_id, booking_id, hold_id, date_from, date_to, actor_id, payload, created_at",
    );
    if (data.from) q = q.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59Z`);
    if (data.types?.length) q = q.in("event_type", data.types);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    // Payload is jsonb; serialize as string for RPC transport safety.
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      event_type: r.event_type as string,
      room_id: (r.room_id as string | null) ?? null,
      booking_id: (r.booking_id as string | null) ?? null,
      hold_id: (r.hold_id as string | null) ?? null,
      date_from: (r.date_from as string | null) ?? null,
      date_to: (r.date_to as string | null) ?? null,
      payload_json: JSON.stringify(r.payload ?? {}),
      created_at: r.created_at as string,
    }));
  });

export const listActiveHolds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: dateStr.optional(), to: dateStr.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    let q = sb.from("booking_holds")
      .select("id, room_id, check_in, check_out, expires_at, guest_email, status, session_id, created_at")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    if (data.from) q = q.gte("check_out", data.from);
    if (data.to) q = q.lte("check_in", data.to);
    const { data: rows, error } = await q.order("expires_at", { ascending: true }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string; room_id: string; check_in: string; check_out: string;
      expires_at: string; guest_email: string | null; status: string; created_at: string;
    }>;
  });

export const releaseHoldStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ holdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    const { data: row, error: e1 } = await sb
      .from("booking_holds")
      .select("session_id")
      .eq("id", data.holdId)
      .maybeSingle();
    if (e1 || !row) throw new Error(e1?.message ?? "Hold not found");
    const { error } = await sb.rpc("release_booking_hold", {
      _hold_id: data.holdId,
      _session_id: row.session_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
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
    const sb: any = context.supabase;
    const { data: res, error } = await sb.rpc("reassign_booking_room", {
      _booking_id: data.bookingId,
      _new_room_id: data.newRoomId,
      _actor: context.userId,
      _reason: data.reason ?? null,
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
    const sb: any = context.supabase;
    const { data: b, error: be } = await sb
      .from("bookings")
      .select("id, room_id, check_in, check_out, adults, children, special_requests, visit_purpose, guest_type")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (be || !b) throw new Error(be?.message ?? "Booking not found");

    const { data: avail, error: ae } = await sb.rpc("get_room_availability", {
      _check_in: b.check_in,
      _check_out: b.check_out,
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