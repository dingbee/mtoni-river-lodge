import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

export const Route = createFileRoute("/api/public/rooms/catalog")({
  server: { handlers: { GET: async ({ request }) => {
    const slug = new URL(request.url).searchParams.get("slug");
    const sb: any = createClient<Database>(
      process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const propertyId = await getConfiguredBookingPropertyId(sb);
    let query = sb.from("rooms").select("id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,catalogue_type_id,catalogue:staynas_room_catalogue_types(id,slug,name,short_name,room_number_label,short_description,description,details,cta_line,capacity_adults,capacity_children,max_occupancy,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,category:staynas_room_catalogue_categories(id,slug,name,description,features,specifications))")
      .eq("status","active").eq("property_id",propertyId).order("sort_order").order("name");
    if (slug) query=query.eq("slug",slug);
    const {data,error}=await query;
    if(error) return Response.json({error:error.message},{status:500});
    const rooms=(data??[]).map((room:any)=>{
      const d=room.catalogue;
      if(!d) return {...room,catalogue:undefined};
      return {...room,name:d.name,short_name:d.short_name,room_number_label:d.room_number_label,
        short_description:d.short_description,description:d.description,details:d.details,cta_line:d.cta_line,
        capacity_adults:d.capacity_adults,capacity_children:d.capacity_children,max_occupancy:d.max_occupancy,
        hero_line:d.hero_line,image_url:d.image_url,gallery_urls:d.gallery_urls,size_label:d.size_label,
        view_label:d.view_label,bed_label:d.bed_label,bathroom_label:d.bathroom_label,category:d.category,catalogue:undefined};
    });
    return Response.json({rooms},{headers:{"cache-control":"public, max-age=30"}});
  }}},
});
