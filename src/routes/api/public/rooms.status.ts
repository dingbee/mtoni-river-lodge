// Aggregate per-room status for a single date (or today by default).
// Public reads are resolved by exact verified hostname and published direct_web channel.

import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { bookingRpc } from "@/lib/booking-rpc";
import { getPublicBookingPropertyId } from "@/lib/booking-property.server";
import { BookingPropertyError } from "@/lib/booking-property";

export const Route = createFileRoute("/api/public/rooms/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return Response.json({ error: "Invalid date" }, { status: 400 });
        }
        const parsedDate = new Date(`${date}T00:00:00.000Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
          return Response.json({ error: "Invalid date" }, { status: 400 });
        }
        const next = new Date(parsedDate);
        next.setUTCDate(next.getUTCDate() + 1);
        const nextIso = next.toISOString().slice(0, 10);
        const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient<Database>;

        let propertyId: string;
        try {
          propertyId = await getPublicBookingPropertyId(sb, hostname);
        } catch (error) {
          if (error instanceof BookingPropertyError) {
            return Response.json({ error: error.message, rooms: [] }, { status: 404, headers: { "cache-control": "no-store" } });
          }
          console.error("[public room status] Property resolution failed", error);
          return Response.json({ error: "Room availability is temporarily unavailable" }, { status: 500 });
        }

        const [{ data, error }, { data: catalog, error: catalogError }] = await Promise.all([
          bookingRpc(sb).rpc("get_room_availability", {
            _check_in: date,
            _check_out: nextIso,
            _property_id: propertyId,
          }),
          sb.from("rooms").select("slug,total_units")
            .eq("status", "active")
            .eq("property_id", propertyId),
        ]);
        if (error) {
          console.error("[public room status] Availability query failed", error);
          return Response.json({ error: "Room availability is temporarily unavailable" }, { status: 500 });
        }
        if (catalogError) {
          console.error("[public room status] Room totals query failed", catalogError);
          return Response.json({ error: "Room availability is temporarily unavailable" }, { status: 500 });
        }
        const totals = new Map((catalog ?? []).map((r: any) => [r.slug as string, Number(r.total_units ?? 0)]));

        return Response.json(
          {
            date,
            rooms: (data ?? []).map((r: any) => ({
              slug: r.slug,
              name: r.name,
              total_units: totals.get(r.slug) ?? 0,
              available_units: Math.max(0, r.min_available),
              is_available: r.is_available,
            })),
          },
          { headers: { "cache-control": "public, max-age=15, s-maxage=15" } },
        );
      },
    },
  },
});
