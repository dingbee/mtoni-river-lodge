import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/rooms/pricing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const checkIn = url.searchParams.get("check_in") ?? new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
          return Response.json({ error: "Invalid check-in date" }, { status: 400 });
        }
        const next = new Date(`${checkIn}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const checkOut = url.searchParams.get("check_out") ?? next.toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
          return Response.json({ error: "Invalid check-out date" }, { status: 400 });
        }
        const adults = Math.max(1, Math.min(20, Number(url.searchParams.get("adults") ?? 2) || 2));
        const childrenBelow6 = Math.max(0, Math.min(20, Number(url.searchParams.get("children_below_6") ?? 0) || 0));
        const children7Plus = Math.max(0, Math.min(20, Number(url.searchParams.get("children_7_plus") ?? 0) || 0));
        const hostname =
          request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
          request.headers.get("host") ??
          url.host;
        const sb: any = createClient<Database>(
          process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await sb.rpc("staynas_get_public_room_pricing", {
          _hostname: hostname,
          _check_in: checkIn,
          _check_out: checkOut,
          _adults: adults,
          _children_below_6: childrenBelow6,
          _children_7_plus: children7Plus,
        });
        if (error) {
          console.error("[public room pricing] published pricing resolution failed", error.message);
          return Response.json({ error: "Room rates are temporarily unavailable" }, { status: 503 });
        }
        return Response.json(
          { check_in: checkIn, check_out: checkOut, rooms: data?.rooms ?? [] },
          { headers: { "cache-control": "private, no-store", vary: "Host" } },
        );
      },
    },
  },
});
