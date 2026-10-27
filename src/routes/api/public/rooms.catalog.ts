import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

export const Route = createFileRoute("/api/public/rooms/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        const sb: any = createClient<Database>(
          process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );
        // Only ever expose the configured booking property's rooms.
        const propertyId = await getConfiguredBookingPropertyId(sb);
        let query = sb.from("rooms")
          .select("id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,category:room_categories(id,slug,name,description,features,specifications)")
          .eq("status","active").eq("property_id", propertyId).order("sort_order").order("name");
        if (slug) query = query.eq("slug", slug);
        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ rooms: data ?? [] }, { headers: { "cache-control": "public, max-age=30" } });
      },
    },
  },
});
