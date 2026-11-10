import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import { getPublicBookingPropertyId } from "@/lib/booking-property.server";
import { BookingPropertyError } from "@/lib/booking-property";

export const Route = createFileRoute("/api/public/rooms/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient<Database>;

        let propertyId: string;
        try {
          propertyId = await getPublicBookingPropertyId(sb, hostname);
        } catch (error) {
          if (error instanceof BookingPropertyError) {
            return Response.json(
              { error: error.message, rooms: [] },
              { status: 404, headers: { "cache-control": "no-store" } },
            );
          }
          console.error("[public room catalogue] Property resolution failed", error);
          return Response.json({ error: "Room catalogue is temporarily unavailable" }, { status: 500 });
        }

        let query = sb.from("rooms")
          .select("id,slug,name,short_name,room_number_label,short_description,description,details,cta_line,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,amenities,category:room_categories(id,slug,name,description,features,specifications)")
          .eq("status", "active")
          .eq("property_id", propertyId)
          .order("sort_order")
          .order("name");
        if (slug) query = query.eq("slug", slug);

        const { data, error } = await query;
        if (error) {
          console.error("[public room catalogue] Room query failed", error);
          return Response.json({ error: "Room catalogue is temporarily unavailable" }, { status: 500 });
        }
        return Response.json(
          { rooms: data ?? [] },
          { headers: { "cache-control": "public, max-age=30, s-maxage=30" } },
        );
      },
    },
  },
});
