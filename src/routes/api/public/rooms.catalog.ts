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
        // Property rows remain the source of commercial and inventory values.
        // Platform catalogue records are authoritative for reusable room definitions.
        const propertyId = await getConfiguredBookingPropertyId(sb);
        let query = sb.from("rooms")
          .select("id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,catalogue_type_id,catalogue:staynas_room_catalogue_types(id,slug,name,short_name,room_number_label,short_description,capacity_adults,capacity_children,max_occupancy,description,details,cta_line,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,category:staynas_room_catalogue_categories(id,slug,name,description,features,specifications))")
          .eq("status", "active").eq("property_id", propertyId).order("sort_order").order("name");
        if (slug) query = query.eq("slug", slug);
        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rooms = (data ?? []).map((room: any) => {
          const definition = room.catalogue;
          if (!definition) {
            // Preserve compatibility for legacy property room records not yet linked.
            return { ...room, catalogue: undefined };
          }
          return {
            ...room,
            name: definition.name,
            short_name: definition.short_name,
            room_number_label: definition.room_number_label,
            short_description: definition.short_description,
            capacity_adults: definition.capacity_adults,
            capacity_children: definition.capacity_children,
            max_occupancy: definition.max_occupancy,
            description: definition.description, details: definition.details, cta_line: definition.cta_line,
            hero_line: definition.hero_line,
            image_url: definition.image_url,
            gallery_urls: definition.gallery_urls,
            size_label: definition.size_label,
            view_label: definition.view_label,
            bed_label: definition.bed_label,
            bathroom_label: definition.bathroom_label,
            category: definition.category,
            catalogue: undefined,
          };
        });
        return Response.json({ rooms }, { headers: { "cache-control": "public, max-age=30" } });
      },
    },
  },
});
