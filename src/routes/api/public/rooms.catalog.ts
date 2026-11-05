import { createFileRoute } from "@tanstack/react-router";
import { resolvePublicBookingContext } from "@/lib/public-booking-context.server";

export const Route = createFileRoute("/api/public/rooms/catalog")({
  server: { handlers: { GET: async ({ request }) => {
    const slug = new URL(request.url).searchParams.get("slug");
    const { property, supabaseAdmin: sb } = await resolvePublicBookingContext();
    const propertyId = property.id;
    let query = sb.from("rooms")
      .select("id,slug,name,short_name,room_number_label,short_description,description,details,cta_line,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,amenities,category:room_categories(id,slug,name,description,features,specifications)")
      .eq("status","active").eq("property_id",propertyId).order("sort_order").order("name");
    if (slug) query=query.eq("slug",slug);
    const {data,error}=await query;
    if(error) return Response.json({error:error.message},{status:500});
    return Response.json({rooms:data??[]},{headers:{"cache-control":"public, max-age=30"}});
  }}},
});
