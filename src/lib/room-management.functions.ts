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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;

    const [categoriesRes, roomsRes] = await Promise.all([
      sb.from("room_categories")
        .select("id,slug,name,description,features,specifications,sort_order,status")
        .eq("property_id", propertyId)
        .order("sort_order").order("name"),
      sb.from("rooms")
        .select("id,slug,name,category_id,short_description,capacity_adults,capacity_children,max_occupancy,total_units,base_price,currency,status,sort_order,included_guests,extra_guest_fee,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label")
        .eq("property_id", propertyId)
        .order("sort_order").order("name"),
    ]);

    if (categoriesRes.error) throw new Error(categoriesRes.error.message);
    if (roomsRes.error) throw new Error(roomsRes.error.message);
    return { propertyId, categories: categoriesRes.data ?? [], rooms: roomsRes.data ?? [] };
  });

export const saveRoomCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireRoomAdmin(context.supabase, context.userId);
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const payload = {
      property_id: propertyId,
      slug: data.slug,
      name: data.name,
      description: data.description || null,
      features: data.features,
      specifications: data.specifications,
      sort_order: data.sortOrder,
      status: data.status,
    };
    const sb: any = context.supabase;
    const q = data.id
      ? sb.from("room_categories").update(payload).eq("id", data.id).eq("property_id", propertyId).select("id").single()
      : sb.from("room_categories").insert(payload).select("id").single();
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
  description: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  details: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(300) })).max(30).default([]),
  ctaLine: z.string().trim().max(300).optional().default(""),
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;

    const { data: existing, error: existingError } = data.id
      ? await sb.from("rooms").select("total_units").eq("id", data.id).eq("property_id", propertyId).single()
      : { data: null, error: null };

    if (existingError) throw new Error(existingError.message);

    const { data: id, error } = await sb.rpc("save_room_type_configuration", {
      _property_id: propertyId,
      _id: data.id ?? null,
      _slug: data.slug,
      _name: data.name,
      _category_id: data.categoryId ?? null,
      _short_description: data.shortDescription || null,
      _capacity_adults: data.capacityAdults,
      _capacity_children: data.capacityChildren,
      _max_occupancy: data.maxOccupancy,
      _total_units: data.quantity,
      _base_price: data.basePrice,
      _currency: data.currency,
      _included_guests: data.includedGuests,
      _extra_guest_fee: data.extraGuestFee,
      _status: data.status,
      _sort_order: data.sortOrder,
      _hero_line: data.heroLine || null,
      _image_url: data.imageUrl || null,
      _gallery_urls: data.galleryUrls,
      _size_label: data.sizeLabel || null,
      _view_label: data.viewLabel || null,
      _bed_label: data.bedLabel || null,
      _bathroom_label: data.bathroomLabel || null,
    } as never);

    if (error) throw new Error(error.message);
    return { id };
  });


const platformCategorySchema = categorySchema.omit({ id: true });
const platformRoomSchema = roomSchema.omit({
  quantity: true, basePrice: true, currency: true, includedGuests: true, extraGuestFee: true,
}).extend({ catalogueCategoryId: z.string().uuid().nullable().optional() });

async function requirePlatformRoomAdmin(supabase: any) {
  const { data, error } = await supabase
    .from("staynas_platform_admins")
    .select("user_id")
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (error || !data) throw new Error("Platform administrator access required");
}

export const listPlatformRoomCatalogue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformRoomAdmin(context.supabase);
    const sb: any = context.supabase;
    const [categories, types] = await Promise.all([
      sb.from("staynas_room_catalogue_categories")
        .select("id,slug,name,description,features,specifications,sort_order,status")
        .order("sort_order").order("name"),
      sb.from("staynas_room_catalogue_types")
        .select("id,category_id,slug,name,short_description,capacity_adults,capacity_children,max_occupancy,description,details,cta_line,hero_line,image_url,gallery_urls,size_label,view_label,bed_label,bathroom_label,status,sort_order")
        .order("sort_order").order("name"),
    ]);
    if (categories.error) throw new Error(categories.error.message);
    if (types.error) throw new Error(types.error.message);
    return { categories: categories.data ?? [], types: types.data ?? [] };
  });

export const savePlatformRoomCatalogueCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => platformCategorySchema.extend({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformRoomAdmin(context.supabase);
    const sb: any = context.supabase;
    const payload = {
      slug: data.slug, name: data.name, description: data.description || null,
      features: data.features, specifications: data.specifications,
      sort_order: data.sortOrder, status: data.status,
    };
    const q = data.id
      ? sb.from("staynas_room_catalogue_categories").update(payload).eq("id", data.id).select("id").single()
      : sb.from("staynas_room_catalogue_categories").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const savePlatformRoomCatalogueType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => platformRoomSchema.extend({ id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePlatformRoomAdmin(context.supabase);
    const sb: any = context.supabase;
    const payload = {
      category_id: data.catalogueCategoryId ?? null,
      slug: data.slug, name: data.name, short_description: data.shortDescription || null,
      capacity_adults: data.capacityAdults, capacity_children: data.capacityChildren,
      max_occupancy: data.maxOccupancy, description: data.description, details: data.details, cta_line: data.ctaLine || null, hero_line: data.heroLine || null,
      image_url: data.imageUrl || null, gallery_urls: data.galleryUrls,
      size_label: data.sizeLabel || null, view_label: data.viewLabel || null,
      bed_label: data.bedLabel || null, bathroom_label: data.bathroomLabel || null,
      status: data.status === "inactive" ? "archived" : "active", sort_order: data.sortOrder,
    };
    const q = data.id
      ? sb.from("staynas_room_catalogue_types").update(payload).eq("id", data.id).select("id").single()
      : sb.from("staynas_room_catalogue_types").insert(payload).select("id").single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });
