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
    if (data.id) {
      const { data: existing, error: existingError } = await sb.from("staynas_rate_plans")
        .select("publication_status").eq("id",data.id).eq("property_id",propertyId).maybeSingle();
      if (existingError || !existing) throw new Error("Rate plan is not part of the active property.");
      if (existing.publication_status === "archived") throw new Error("Archived rate plans are read-only. Duplicate the plan to create a new version.");
      if (existing.publication_status === "published") throw new Error("Suspend the rate plan before editing its commercial terms.");
    }
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
    const { data: current, error: currentError } = await sb.from("staynas_rate_plans")
      .select("id,publication_status,active").eq("id",data.id).eq("property_id",propertyId).maybeSingle();
    if (currentError || !current) throw new Error("Rate plan is not part of the active property.");
    if (current.publication_status === "archived") throw new Error("Archived rate plans are terminal and cannot be changed.");
    const nextActive = data.publication_status === "archived"
      ? false
      : (data.active ?? current.active);
    if (data.publication_status === "published" && !nextActive) {
      throw new Error("An inactive rate plan cannot be published.");
    }
    if (data.publication_status === "published") {
      const { count, error: assignmentError } = await sb.from("staynas_rate_plan_room_types")
        .select("id",{count:"exact",head:true})
        .eq("property_id",propertyId).eq("rate_plan_id",data.id).eq("active",true);
      if (assignmentError) throw new Error(assignmentError.message);
      if (!count) throw new Error("Assign at least one property room type before publishing this rate plan.");
    }
    const { data: row, error } = await sb.from("staynas_rate_plans")
      .update({
        publication_status: data.publication_status,
        active: nextActive,
        ...(data.publication_status === "published" ? {
          published_by: context.userId,
          published_at: new Date().toISOString(),
        } : {}),
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
    const [roomTypesResult, assignmentsResult] = await Promise.all([
      sb.rpc("get_staynas_rate_plan_room_types",{_property_id:propertyId}),
      sb.from("staynas_rate_plan_room_types")
        .select("id,rate_plan_id,room_type_id,active,display_order")
        .eq("property_id",propertyId),
    ]);
    if (roomTypesResult.error) throw new Error(roomTypesResult.error.message);
    if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
    return { roomTypes:roomTypesResult.data ?? [], assignments:assignmentsResult.data ?? [] };
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
      .select("id,publication_status").eq("id",data.rate_plan_id).eq("property_id",propertyId).maybeSingle();
    if (planError || !plan) throw new Error("Rate plan is not part of the active property.");
    if (plan.publication_status === "published" || plan.publication_status === "archived") {
      throw new Error("Suspend the rate plan before changing room-type assignments.");
    }
    const { data: propertyRoomTypes, error: roomTypeError } = await sb.rpc(
      "get_staynas_rate_plan_room_types",{_property_id:propertyId},
    );
    if (roomTypeError) throw new Error(roomTypeError.message);
    if (!(propertyRoomTypes ?? []).some((type: {id:string}) => type.id===data.room_type_id)) {
      throw new Error("Room type is not configured for the active property.");
    }
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
