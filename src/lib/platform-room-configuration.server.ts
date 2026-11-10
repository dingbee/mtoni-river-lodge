import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error(error?.message ?? "No active property selected");
  return data as string;
}
async function requireRoomAdmin(supabase: any, userId: string) {
  await requireStayNasModuleAccess(supabase, userId, "rooms.configure");
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
  totalUnits: z.number().int().min(0).max(10000).default(1),
  basePrice: z.number().min(0).max(1000000000).default(0),
  includedGuests: z.number().int().min(1).max(30).default(2),
  extraGuestFee: z.number().min(0).max(1000000000).default(0),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
export const getPlatformRoomConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await requireRoomAdmin(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [property, categories, rooms] = await Promise.all([
      sb.from("staynas_properties").select("id,name,currency").eq("id", propertyId).single(),
      sb.from("room_categories").select("id,slug,name,description,features,specifications,sort_order,status").eq("property_id", propertyId).eq("configuration_source", "tenant_configured").order("sort_order").order("name"),
      sb.from("rooms").select("id,slug,name,category_id,short_name,room_number_label,short_description,description,details,cta_line,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,amenities,status,sort_order").eq("property_id", propertyId).eq("configuration_source", "tenant_configured").order("sort_order").order("name"),
    ]);
    if (property.error) throw new Error(property.error.message);
    if (categories.error) throw new Error(categories.error.message);
    if (rooms.error) throw new Error(rooms.error.message);
    return { property: property.data, categories: categories.data ?? [], roomTypes: rooms.data ?? [] };
  });
export const savePlatformRoomCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const payload = { property_id: propertyId, configuration_source: "tenant_configured", configured_by: context.userId, configured_at: new Date().toISOString(), slug:data.slug, name:data.name, description:data.description || null, features:data.features, specifications:data.specifications, sort_order:data.sortOrder, status:data.status };
    const q = data.id ? sb.from("room_categories").update(payload).eq("id",data.id).eq("property_id",propertyId).eq("configuration_source","tenant_configured").select("id").single() : sb.from("room_categories").insert(payload).select("id").single();
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
      const { data: category, error } = await sb.from("room_categories").select("id").eq("id", data.categoryId).eq("property_id", propertyId).maybeSingle();
      if (error || !category) throw new Error("Selected category does not belong to the active property");
    }
    const { data: existing, error: existingError } = data.id ? await sb.from("rooms").select("total_units,base_price,currency,included_guests,extra_guest_fee,configuration_source").eq("id",data.id).eq("property_id",propertyId).single() : { data:null, error:null };
    if (existingError) throw new Error(existingError.message);
    if (data.id && existing?.configuration_source !== "tenant_configured") throw new Error("Legacy or unverified room records cannot be adopted or edited as tenant configuration.");
    const { data: property, error: propertyError } = await sb.from("staynas_properties").select("currency").eq("id",propertyId).single();
    if (propertyError) throw new Error(propertyError.message);
    if (!existing && !property.currency) throw new Error("Configure the property currency before creating room types");
    const payload = {
      property_id:propertyId, configuration_source:"tenant_configured", configured_by:context.userId, configured_at:new Date().toISOString(), category_id:data.categoryId ?? null, slug:data.slug, name:data.name,
      short_name:data.shortName || null, room_number_label:data.roomNumberLabel || null,
      short_description:data.shortDescription || null, description:data.description, details:data.details,
      cta_line:data.ctaLine || null, capacity_adults:data.capacityAdults, capacity_children:data.capacityChildren,
      max_occupancy:data.maxOccupancy, hero_line:data.heroLine || null, image_url:data.imageUrl || null,
      gallery_urls:data.galleryUrls, size_label:data.sizeLabel || null, view_label:data.viewLabel || null,
      bed_label:data.bedLabel || null, bathroom_label:data.bathroomLabel || null, amenities:data.amenities,
      status:data.status === "archived" ? "inactive" : "active", sort_order:data.sortOrder,
      total_units:data.totalUnits, base_price:data.basePrice,
      currency:existing?.currency ?? property.currency, included_guests:data.includedGuests,
      extra_guest_fee:data.extraGuestFee,
    };
    const q = data.id ? sb.from("rooms").update(payload).eq("id",data.id).eq("property_id",propertyId).select("id").single() : sb.from("rooms").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });
