// Aggregate per-room status for a single date (or today by default).
// Returns: {rooms: [{slug, name, total, available, blocked, held}]}.

import { createFileRoute } from "@tanstack/react-router";
import { bookingRpc } from "@/lib/booking-rpc";
import { resolvePublicDirectBookingChannel } from "@/lib/public-booking-channel.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/public/rooms/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return Response.json({ error: "Invalid date" }, { status: 400 });
        }
        const next = new Date(date);
        next.setUTCDate(next.getUTCDate() + 1);
        const nextIso = next.toISOString().slice(0, 10);

        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const channel = await resolvePublicDirectBookingChannel(sb, request.headers.get("host") ?? url.host);
        const propertyId = channel.propertyId;
        const [{ data, error }, { data: catalog, error: catalogError }] = await Promise.all([
          bookingRpc(sb).rpc("get_room_availability", { _check_in: date, _check_out: nextIso, _property_id: propertyId }),
          (sb as unknown as SupabaseClient).from("rooms").select("slug,total_units").eq("status", "active").eq("property_id", propertyId),
        ]);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (catalogError) return Response.json({ error: catalogError.message }, { status: 500 });
        const totals = new Map((catalog ?? []).map((r) => [r.slug as string, Number(r.total_units ?? 0)]));

        return Response.json(
          {
            date,
            rooms: (data ?? []).map((r) => ({
              slug: r.slug,
              name: r.name,
              total_units: totals.get(r.slug) ?? 0,
              available_units: Math.max(0, r.min_available),
              is_available: r.is_available,
            })),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});