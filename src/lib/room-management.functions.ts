import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function requireRoomAdmin(supabase: any, userId: string) {
  await requireStayNasModuleAccess(supabase, userId, "operations");
  const { data, error } = await supabase.rpc("current_user_roles");
  if (error) throw new Error(error.message);
  const roles = Array.isArray(data) ? data : [];
  if (!roles.some((r: string) => ["owner", "manager", "admin"].includes(r))) {
    throw new Error("Room configuration requires owner or manager access.");
  }
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  features: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  specifications: z.record(z.string(), z.string().trim().max(300)).default({}),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: z.enum(["active", "archived"]).default("active"),
});

export const listRoomConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const [categoriesRes, roomsRes] = await Promise.all([
      context.supabase.from("room_categories")
        .select("id,slug,name,description,features,specifications,sort_order,status")
        .order("sort_order").order("name"),
      context.supabase.from("rooms")
        .select("id,slug,name,category_id,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,status,sort_order,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label")
        .order("sort_order").order("name"),
    ]);
    if (categoriesRes.error) throw new Error(categoriesRes.error.message);
    if (roomsRes.error) throw new Error(roomsRes.error.message);
    return { categories: categoriesRes.data ?? [], rooms: roomsRes.data ?? [] };
  });

export const saveRoomCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const payload = {
      slug: data.slug, name: data.name, description: data.description || null,
      features: data.features, specifications: data.specifications,
      sort_order: data.sortOrder, status: data.status,
    };
    const q = data.id
      ? context.supabase.from("room_categories").update(payload).eq("id", data.id).select("id").single()
      : context.supabase.from("room_categories").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

const roomSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().nullable().optional(),
  shortDescription: z.string().trim().max(1000).optional().default(""),
  capacityAdults: z.number().int().min(1).max(20),
  capacityChildren: z.number().int().min(0).max(20),
  maxOccupancy: z.number().int().min(1).max(30),
  quantity: z.number().int().min(1).max(1000),
  basePrice: z.number().min(0).max(100000000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  includedGuests: z.number().int().min(1).max(30),
  extraGuestFee: z.number().min(0).max(100000000),
  status: z.enum(["active", "inactive"]).default("active"),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  heroLine: z.string().trim().max(300).optional().default(""),
  imageUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
  galleryUrls: z.array(z.string().url().max(1000)).max(20).default([]),
  sizeLabel: z.string().trim().max(80).optional().default(""),
  viewLabel: z.string().trim().max(120).optional().default(""),
  bedLabel: z.string().trim().max(120).optional().default(""),
  bathroomLabel: z.string().trim().max(120).optional().default(""),
});

export const saveRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roomSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const { data: id, error } = await context.supabase.rpc("save_room_type_configuration", {
      _id: data.id ?? null, _slug: data.slug, _name: data.name,
      _category_id: data.categoryId ?? null, _short_description: data.shortDescription || null,
      _capacity_adults: data.capacityAdults, _capacity_children: data.capacityChildren,
      _max_occupancy: data.maxOccupancy, _total_units: data.quantity,
      _base_price: data.basePrice, _currency: data.currency,
      _included_guests: data.includedGuests, _extra_guest_fee: data.extraGuestFee,
      _status: data.status, _sort_order: data.sortOrder,
      _hero_line: data.heroLine || null, _image_url: data.imageUrl || null,
      _gallery_urls: data.galleryUrls, _size_label: data.sizeLabel || null,
      _view_label: data.viewLabel || null, _bed_label: data.bedLabel || null,
      _bathroom_label: data.bathroomLabel || null,
    } as never);
    if (error) throw new Error(error.message);
    return { id };
  });
