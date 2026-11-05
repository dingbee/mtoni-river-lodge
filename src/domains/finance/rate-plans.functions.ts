import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function getActivePropertyId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

const ratePlanSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().trim().min(2).max(60),
  pricing_basis: z.enum(["per_room","per_person","occupancy_based"]),
  meal_plan: z.enum(["room_only","bed_breakfast","half_board","full_board","all_inclusive","custom"]),
  cancellation_policy: z.record(z.string(), z.unknown()).default({}),
  refundable: z.boolean().default(true),
  booking_conditions: z.record(z.string(), z.unknown()).default({}),
  effective_from: z.string().date().nullable().optional(),
  effective_to: z.string().date().nullable().optional(),
  parent_rate_plan_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
}).refine((v) => !v.effective_from || !v.effective_to || v.effective_to >= v.effective_from, {
  message: "Effective end date must be on or after the start date.",
  path: ["effective_to"],
});

export const listStayNasRatePlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [propertyResult, plansResult] = await Promise.all([
      sb.from("staynas_properties").select("id,name,currency,timezone").eq("id",propertyId).single(),
      sb.from("staynas_rate_plans").select("*").eq("property_id",propertyId).order("name"),
    ]);
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (plansResult.error) throw new Error(plansResult.error.message);
    return { property: propertyResult.data, plans: plansResult.data ?? [] };
  });

export const saveStayNasRatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ratePlanSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("currency").eq("id",propertyId).single();
    if (propertyError || !property?.currency) throw new Error("Property currency must be configured before managing rate plans.");
    if (data.parent_rate_plan_id) {
      const { data: parent, error: parentError } = await sb.from("staynas_rate_plans")
        .select("id").eq("id",data.parent_rate_plan_id).eq("property_id",propertyId).maybeSingle();
      if (parentError || !parent) throw new Error("Parent rate plan is not part of the active property.");
    }
    const payload = {
      ...data,
      property_id: propertyId,
      currency: String(property.currency).toUpperCase(),
      code: data.code.toUpperCase(),
      updated_by: context.userId,
      ...(data.id ? {} : { created_by: context.userId }),
    };
    delete (payload as {id?: string}).id;
    const query = data.id
      ? sb.from("staynas_rate_plans").update(payload).eq("id",data.id).eq("property_id",propertyId)
      : sb.from("staynas_rate_plans").insert(payload);
    const { data: row, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setStayNasRatePlanPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    publication_status: z.enum(["draft","published","suspended","archived"]),
    active: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: row, error } = await sb.from("staynas_rate_plans")
      .update({
        publication_status: data.publication_status,
        ...(data.active === undefined ? {} : { active: data.active }),
        published_by: data.publication_status === "published" ? context.userId : null,
        published_at: data.publication_status === "published" ? new Date().toISOString() : null,
        updated_by: context.userId,
      })
      .eq("id",data.id).eq("property_id",propertyId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listStayNasRatePlanVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rows, error } = await sb.from("staynas_rate_plan_versions")
      .select("id,rate_plan_id,version,snapshot,change_reason,created_at")
      .eq("rate_plan_id",data.id).eq("property_id",propertyId).order("version",{ascending:false});
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const listStayNasRatePlanRoomTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [roomRows, assignmentsResult] = await Promise.all([
      sb.from("rooms")
        .select("catalogue_type_id,staynas_room_catalogue_types!inner(id,name,slug)")
        .eq("property_id",propertyId)
        .not("catalogue_type_id","is",null),
      sb.from("staynas_rate_plan_room_types")
        .select("id,rate_plan_id,room_type_id,active,display_order")
        .eq("property_id",propertyId),
    ]);
    if (roomRows.error) throw new Error(roomRows.error.message);
    if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
    const uniqueTypes = new Map<string,{id:string;name:string;slug:string}>();
    for (const row of roomRows.data ?? []) {
      const type = row.staynas_room_catalogue_types;
      if (type?.id) uniqueTypes.set(type.id,{id:type.id,name:type.name,slug:type.slug});
    }
    return { roomTypes:[...uniqueTypes.values()], assignments:assignmentsResult.data ?? [] };
  });

export const setStayNasRatePlanRoomType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    rate_plan_id:z.string().uuid(),
    room_type_id:z.string().uuid(),
    active:z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: plan, error: planError } = await sb.from("staynas_rate_plans")
      .select("id").eq("id",data.rate_plan_id).eq("property_id",propertyId).maybeSingle();
    if (planError || !plan) throw new Error("Rate plan is not part of the active property.");
    const { data: roomType, error: roomTypeError } = await sb.from("rooms")
      .select("id").eq("property_id",propertyId).eq("catalogue_type_id",data.room_type_id).limit(1).maybeSingle();
    if (roomTypeError || !roomType) throw new Error("Room type is not configured for the active property.");
    const { data: assignment, error } = await sb.from("staynas_rate_plan_room_types").upsert({
      property_id:propertyId,
      rate_plan_id:data.rate_plan_id,
      room_type_id:data.room_type_id,
      active:data.active,
      updated_by:context.userId,
      ...(data.active ? { created_by:context.userId } : {}),
    },{onConflict:"property_id,rate_plan_id,room_type_id"}).select("*").single();
    if (error) throw new Error(error.message);
    return assignment;
  });
