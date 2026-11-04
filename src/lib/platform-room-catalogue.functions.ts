import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const categoryInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  features: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  specifications: z.record(z.string(), z.string().trim().max(300)).default({}),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});
const roomInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().nullable().optional(),
  shortName: z.string().trim().max(120).optional().default(""),
  roomNumberLabel: z.string().trim().max(80).optional().default(""),
  shortDescription: z.string().trim().max(1000).optional().default(""),
  description: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  details: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(300) })).max(30).default([]),
  ctaLine: z.string().trim().max(300).optional().default(""),
  heroLine: z.string().trim().max(300).optional().default(""),
  imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
  galleryUrls: z.array(z.string().url().max(1000)).max(20).default([]),
  sizeLabel: z.string().trim().max(80).optional().default(""),
  viewLabel: z.string().trim().max(120).optional().default(""),
  bedLabel: z.string().trim().max(120).optional().default(""),
  bathroomLabel: z.string().trim().max(120).optional().default(""),
  capacityAdults: z.number().int().min(1).max(20),
  capacityChildren: z.number().int().min(0).max(20),
  maxOccupancy: z.number().int().min(1).max(30),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});
async function assertPlatformAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("staynas_platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error || !data) throw new Error("Platform administrator access required");
}
export const listPlatformRoomCatalogue = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertPlatformAdmin(context.supabase, context.userId);
  const sb: any = context.supabase;
  const [categories, types] = await Promise.all([
    sb.from("staynas_room_catalogue_categories").select("id,slug,name,description,features,specifications,sort_order,status").order("sort_order").order("name"),
    sb.from("staynas_room_catalogue_types").select("id,category_id,slug,name,short_name,room_number_label,short_description,description,details,cta_line,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,capacity_adults,capacity_children,max_occupancy,status,sort_order").order("sort_order").order("name"),
  ]);
  if (categories.error) throw new Error(categories.error.message);
  if (types.error) throw new Error(types.error.message);
  return { categories: categories.data ?? [], types: types.data ?? [] };
});
export const savePlatformRoomCategory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => categoryInput.parse(data)).handler(async ({ data, context }) => {
  await assertPlatformAdmin(context.supabase, context.userId);
  const payload = { slug:data.slug, name:data.name, description:data.description || null, features:data.features, specifications:data.specifications, sort_order:data.sortOrder, status:data.status };
  const sb: any = context.supabase;
  const query = data.id ? sb.from("staynas_room_catalogue_categories").update(payload).eq("id",data.id).select("id").single() : sb.from("staynas_room_catalogue_categories").insert(payload).select("id").single();
  const { data: row, error } = await query;
  if (error) throw new Error(error.message);
  return row;
});
export const savePlatformRoomType = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => roomInput.parse(data)).handler(async ({ data, context }) => {
  await assertPlatformAdmin(context.supabase, context.userId);
  const payload = {
    category_id:data.categoryId ?? null, slug:data.slug, name:data.name, short_name:data.shortName || null,
    room_number_label:data.roomNumberLabel || null, short_description:data.shortDescription || null,
    description:data.description, details:data.details, cta_line:data.ctaLine || null, hero_line:data.heroLine || null,
    image_url:data.imageUrl || null, gallery_urls:data.galleryUrls, size_label:data.sizeLabel || null,
    view_label:data.viewLabel || null, bed_label:data.bedLabel || null, bathroom_label:data.bathroomLabel || null,
    capacity_adults:data.capacityAdults, capacity_children:data.capacityChildren, max_occupancy:data.maxOccupancy,
    status:data.status === "inactive" ? "archived" : "active", sort_order:data.sortOrder,
  };
  const sb: any = context.supabase;
  const query = data.id ? sb.from("staynas_room_catalogue_types").update(payload).eq("id",data.id).select("id").single() : sb.from("staynas_room_catalogue_types").insert(payload).select("id").single();
  const { data: row, error } = await query;
  if (error) throw new Error(error.message);
  return row;
});
