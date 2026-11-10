import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/rooms/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return Response.json({ error: "Invalid date" }, { status: 400 });
        }
        const hostname =
          request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
          request.headers.get("host") ??
          url.host;
        const sb: any = createClient<Database>(
          process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await sb.rpc("staynas_get_public_room_status", {
          _hostname: hostname,
          _date: date,
        });
        if (error) {
          console.error("[public room status] property-scoped resolver failed", error.message);
          return Response.json({ error: "Room availability is temporarily unavailable" }, { status: 503 });
        }
        return Response.json(
          { date, rooms: data?.rooms ?? [] },
          { headers: { "cache-control": "private, no-store", vary: "Host" } },
        );
      },
    },
  },
});
