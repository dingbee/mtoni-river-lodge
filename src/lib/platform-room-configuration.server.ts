import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function requireRoomAdmin(supabase: any, userId: string) {
  await requireStayNasModuleAccess(supabase, userId, "rooms.configure");
}
async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error(error?.message ?? "No active property selected");
  return data as string;
}
const categorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  features: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  specifications: z.record(z.string(), z.string().trim().max(300)).default({}),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
const roomSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().nullable().optional(),
  shortName: z.string().trim().max(120).default(""),
  roomNumberLabel: z.string().trim().max(80).default(""),
  shortDescription: z.string().trim().max(1000).default(""),
  description: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  details: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(300) })).max(30).default([]),
  ctaLine: z.string().trim().max(300).default(""),
  heroLine: z.string().trim().max(300).default(""),
  imageUrl: z.string().trim().url().max(1000).or(z.literal("")).default(""),
  galleryUrls: z.array(z.string().url().max(1000)).max(20).default([]),
  sizeLabel: z.string().trim().max(80).default(""),
  viewLabel: z.string().trim().max(120).default(""),
  bedLabel: z.string().trim().max(120).default(""),
  bathroomLabel: z.string().trim().max(120).default(""),
  amenities: z.array(z.string().trim().min(1).max(100)).max(80).default([]),
  capacityAdults: z.number().int().min(1).max(20),
  capacityChildren: z.number().int().min(0).max(20),
  maxOccupancy: z.number().int().min(1).max(30),
  totalUnits: z.number().int().min(1).max(10000).default(1),
  basePrice: z.number().min(0).max(1000000000).default(0),
  includedGuests: z.number().int().min(1).max(30).default(2),
  extraGuestFee: z.number().min(0).max(1000000000).default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
export const getPlatformRoomConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [property, categories, rooms, roomStates] = await Promise.all([
      sb.from("staynas_properties").select("id,name,currency").eq("id", propertyId).single(),
      sb.from("room_categories").select("id,slug,name,description,features,specifications,sort_order,status,configuration_source").eq("property_id", propertyId).order("sort_order").order("name"),
      sb.from("rooms").select("id,slug,name,category_id,short_name,room_number_label,short_description,description,details,cta_line,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,amenities,status,sort_order,configuration_source").eq("property_id", propertyId).order("sort_order").order("name"),
      sb.from("room_states").select("room_id").eq("property_id", propertyId),
    ]);
    if (property.error) throw new Error(property.error.message);
    if (categories.error) throw new Error(categories.error.message);
    if (rooms.error) throw new Error(rooms.error.message);
    if (roomStates.error) throw new Error(roomStates.error.message);
    const physicalCounts = new Map<string, number>();
    for (const state of roomStates.data ?? []) physicalCounts.set(state.room_id, (physicalCounts.get(state.room_id) ?? 0) + 1);
    const roomTypes = (rooms.data ?? []).map((room: any) => ({
      ...room,
      configured_units: Number(room.total_units ?? 0),
      physical_units: physicalCounts.get(room.id) ?? 0,
      inventory_synced: Number(room.total_units ?? 0) === (physicalCounts.get(room.id) ?? 0),
    }));
    return { property: property.data, categories: categories.data ?? [], roomTypes };
  });
export const savePlatformRoomCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const existing = data.id
      ? await sb.from("room_categories")
          .select("configuration_source")
          .eq("id", data.id)
          .eq("property_id", propertyId)
          .maybeSingle()
      : { data: null, error: null };
    if (existing.error) throw new Error(existing.error.message);
    
    const payload = {
      property_id: propertyId,
      configuration_source: "tenant_configured",
      configured_by: context.userId,
      configured_at: new Date().toISOString(),
      slug: data.slug,
      name: data.name,
      description: data.description || null,
      features: data.features,
      specifications: data.specifications,
      sort_order: data.sortOrder,
      status: data.status,
    };
    const q = data.id
      ? sb.from("room_categories").update(payload)
          .eq("id", data.id)
          .eq("property_id", propertyId)
          .select("id").single()
      : sb.from("room_categories").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });
export const savePlatformRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roomSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;

    if (data.categoryId) {
      const { data: category, error } = await sb.from("room_categories")
        .select("id")
        .eq("id", data.categoryId)
        .eq("property_id", propertyId)
        .maybeSingle();
      if (error || !category) throw new Error("Selected category does not belong to the active property");
    }

    const { data: existing, error: existingError } = data.id
      ? await sb.from("rooms")
          .select("currency,configuration_source")
          .eq("id", data.id)
          .eq("property_id", propertyId)
          .single()
      : { data: null, error: null };
    if (existingError) throw new Error(existingError.message);
    

    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("currency")
      .eq("id", propertyId)
      .single();
    if (propertyError) throw new Error(propertyError.message);
    const currency = existing?.currency ?? property.currency;
    if (!currency) throw new Error("Configure the property currency before creating room types");

    const { data: roomId, error } = await sb.rpc("save_platform_room_type_configuration", {
      _property_id: propertyId,
      _id: data.id ?? null,
      _slug: data.slug,
      _name: data.name,
      _category_id: data.categoryId ?? null,
      _short_name: data.shortName,
      _room_number_label: data.roomNumberLabel,
      _short_description: data.shortDescription,
      _description: data.description,
      _details: data.details,
      _cta_line: data.ctaLine,
      _capacity_adults: data.capacityAdults,
      _capacity_children: data.capacityChildren,
      _max_occupancy: data.maxOccupancy,
      _total_units: data.totalUnits,
      _base_price: data.basePrice,
      _currency: currency,
      _included_guests: data.includedGuests,
      _extra_guest_fee: data.extraGuestFee,
      _status: data.status === "archived" ? "inactive" : "active",
      _sort_order: data.sortOrder,
      _hero_line: data.heroLine,
      _image_url: data.imageUrl,
      _gallery_urls: data.galleryUrls,
      _size_label: data.sizeLabel,
      _view_label: data.viewLabel,
      _bed_label: data.bedLabel,
      _bathroom_label: data.bathroomLabel,
      _amenities: data.amenities,
    });
    if (error) throw new Error(error.message);
    return { id: roomId };
  });
