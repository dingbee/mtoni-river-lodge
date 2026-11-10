import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/public/rooms/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        const hostname =
          request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
          request.headers.get("host") ??
          url.host;
        const sb: any = createClient<Database>(
          process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await sb.rpc("staynas_get_public_room_catalog", {
          _hostname: hostname,
          _slug: slug,
        });
        if (error) {
          console.error("[public room catalogue] property-scoped resolver failed", error.message);
          return Response.json({ error: "Room catalogue is temporarily unavailable" }, { status: 503 });
        }
        return Response.json(
          { rooms: data?.rooms ?? [] },
          { headers: { "cache-control": "private, no-store", vary: "Host" } },
        );
      },
    },
  },
});
