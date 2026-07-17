// Public availability search — the /book flow and external partners call this.
// GET /api/public/availability/search?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD[&guests=2]

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/availability/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const checkIn = url.searchParams.get("check_in");
        const checkOut = url.searchParams.get("check_out");
        const guests = Math.max(1, Math.min(20, Number(url.searchParams.get("guests") ?? "1")));
        if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
          return Response.json({ error: "check_in and check_out are required (YYYY-MM-DD)" }, { status: 400 });
        }
        if (checkOut <= checkIn) {
          return Response.json({ error: "check_out must be after check_in" }, { status: 400 });
        }
        const sb = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await sb.rpc("get_room_availability", {
          _check_in: checkIn,
          _check_out: checkOut,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const rooms = (data ?? [])
          .map((r: any) => ({
            slug: r.slug,
            name: r.name,
            base_price: Number(r.base_price),
            currency: r.currency,
            max_occupancy: r.max_occupancy,
            nights: r.nights,
            nightly_total: Number(r.nightly_total),
            available_units: Math.max(0, r.min_available),
            is_available: r.is_available,
            fits_guests: guests <= r.max_occupancy,
          }))
          .filter((r) => r.is_available && r.fits_guests)
          .sort((a, b) => a.base_price - b.base_price);
        return Response.json(
          { check_in: checkIn, check_out: checkOut, guests, rooms },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});