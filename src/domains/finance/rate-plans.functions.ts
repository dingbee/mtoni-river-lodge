import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { seasonalRatesSchema, mergeSeasonalRateRecords, validateSeasonalRateCurrency, validateSeasonalRateRoomTypes } from "@/domains/finance/seasonal-pricing";
import { dailyRatesSchema, mergeDailyRateRecords, validateDailyRateCurrency, validateDailyRateRoomTypes } from "@/domains/finance/daily-rate-calendar";
import { restrictionRulesSchema, mergeRestrictionRecords, validateRestrictionRoomTypes, type RestrictionRule } from "@/domains/finance/rate-plan-restrictions";
import { assertRatePlanRoomTypeAssignments } from "@/domains/finance/rate-plan-publication";

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
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()).optional(),
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
  rate_plan_data: z.object({
    base_rates: z.record(z.string(), z.unknown()).optional(),
    seasonal_rates: z.record(z.string(), z.unknown()).optional(),
    daily_rates: z.record(z.string(), z.unknown()).optional(),
    occupancy_rules: z.record(z.string(), z.unknown()).optional(),
    restrictions: z.record(z.string(), z.unknown()).optional(),
  }).default({}),
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
    if (propertyError || !property?.currency) throw new Error("Property operating currency must be configured before managing rate plans.");
    let ratePlanCurrency = String(data.currency ?? property.currency).toUpperCase();
    if (data.id) {
      const { data: existing, error: existingError } = await sb.from("staynas_rate_plans")
        .select("publication_status,currency").eq("id",data.id).eq("property_id",propertyId).maybeSingle();
      if (existingError || !existing) throw new Error("Rate plan is not part of the active property.");
      if (!data.currency) ratePlanCurrency = String(existing.currency ?? property.currency).toUpperCase();
      if (existing.publication_status === "archived") throw new Error("Archived rate plans are read-only. Duplicate the plan to create a new version.");
      if (existing.publication_status === "published") throw new Error("Suspend the rate plan before editing its commercial terms.");
    }
    if (!/^[A-Z]{3}$/.test(ratePlanCurrency)) throw new Error("Rate-plan transaction currency must be a valid ISO 4217 code.");
    for (const [roomTypeId, rawRate] of Object.entries(data.rate_plan_data.base_rates ?? {})) {
      if (!rawRate || typeof rawRate !== "object" || Array.isArray(rawRate)) continue;
      const rateCurrency = (rawRate as Record<string, unknown>).currency;
      if (rateCurrency && String(rateCurrency).toUpperCase() !== ratePlanCurrency) {
        throw new Error(`Base rate for room type ${roomTypeId} must use rate-plan currency ${ratePlanCurrency}.`);
      }
    }
    let inheritedSeasonalRates: Record<string, unknown> = {};
    let inheritedDailyRates: Record<string, unknown> = {};
    let inheritedRestrictions: Record<string, unknown> = {};
    if (data.parent_rate_plan_id) {
      const { data: parent, error: parentError } = await sb.from("staynas_rate_plans")
        .select("id").eq("id",data.parent_rate_plan_id).eq("property_id",propertyId).maybeSingle();
      if (parentError || !parent) throw new Error("Parent rate plan is not part of the active property.");
      const { data: inherited, error: inheritanceError } = await sb.rpc(
        "resolve_staynas_rate_plan_inheritance",
        { _property_id: propertyId, _rate_plan_id: data.parent_rate_plan_id },
      );
      if (inheritanceError) throw new Error(inheritanceError.message);
      inheritedSeasonalRates = (inherited?.resolved_data?.seasonal_rates ?? {}) as Record<string, unknown>;
      inheritedDailyRates = (inherited?.resolved_data?.daily_rates ?? {}) as Record<string, unknown>;
      inheritedRestrictions = (inherited?.resolved_data?.restrictions ?? {}) as Record<string, unknown>;
    }

    const ownSeasonalRates = (data.rate_plan_data.seasonal_rates ?? {}) as Record<string, unknown>;
    const mergedSeasonalRates = mergeSeasonalRateRecords(inheritedSeasonalRates, ownSeasonalRates);
    // A null season key explicitly clears an inherited season. Remaining active
    // entries must be complete, valid, and unambiguous after inheritance.
    const effectiveSeasonalRates = seasonalRatesSchema.parse(
      Object.fromEntries(Object.entries(mergedSeasonalRates).filter(([, value]) => value !== null)),
    );
    validateSeasonalRateCurrency(effectiveSeasonalRates, ratePlanCurrency);
    if (Object.keys(effectiveSeasonalRates).length) {
      const { data: roomTypes, error: roomTypesError } = await sb.rpc(
        "get_staynas_rate_plan_room_types", { _property_id: propertyId },
      );
      if (roomTypesError) throw new Error(roomTypesError.message);
      validateSeasonalRateRoomTypes(
        effectiveSeasonalRates,
        new Set((roomTypes ?? []).map((roomType: { id: string }) => roomType.id)),
      );
    }
    const ownDailyRates = (data.rate_plan_data.daily_rates ?? {}) as Record<string, unknown>;
    const mergedDailyRates = mergeDailyRateRecords(inheritedDailyRates, ownDailyRates);
    const normalizedDailyRates = Object.fromEntries(
      Object.entries(mergedDailyRates)
        .filter(([, value]) => value !== null && typeof value === "object" && !Array.isArray(value))
        .map(([date, value]) => [
          date,
          Object.fromEntries(
            Object.entries(value as Record<string, unknown>).filter(([, rate]) => rate !== null),
          ),
        ])
        .filter(([, roomRates]) => Object.keys(roomRates as Record<string, unknown>).length > 0),
    );
    const effectiveDailyRates = dailyRatesSchema.parse(normalizedDailyRates);
    validateDailyRateCurrency(effectiveDailyRates, ratePlanCurrency);
    if (Object.keys(effectiveDailyRates).length) {
      const { data: roomTypes, error: roomTypesError } = await sb.rpc(
        "get_staynas_rate_plan_room_types", { _property_id: propertyId },
      );
      if (roomTypesError) throw new Error(roomTypesError.message);
      validateDailyRateRoomTypes(
        effectiveDailyRates,
        new Set((roomTypes ?? []).map((roomType: { id: string }) => roomType.id)),
      );
    }
    const ownRestrictions = (data.rate_plan_data.restrictions ?? {}) as Record<string, unknown>;
    const mergedRestrictions = mergeRestrictionRecords(inheritedRestrictions, ownRestrictions);
    const effectiveRestrictions = restrictionRulesSchema.parse(mergedRestrictions) as Record<string, RestrictionRule>;
    if (Object.keys(effectiveRestrictions).length) {
      const { data: roomTypes, error: roomTypesError } = await sb.rpc(
        "get_staynas_rate_plan_room_types", { _property_id: propertyId },
      );
      if (roomTypesError) throw new Error(roomTypesError.message);
      validateRestrictionRoomTypes(
        effectiveRestrictions,
        new Set((roomTypes ?? []).map((roomType: { id: string }) => roomType.id)),
      );
    }
    const payload = {
      ...data,
      property_id: propertyId,
      currency: ratePlanCurrency,
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
    change_reason: z.string().trim().min(5).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const sb: any = context.supabase;
    if (data.publication_status === "published") {
      const { data: resolved, error: resolveError } = await sb.rpc(
        "resolve_staynas_rate_plan_inheritance",
        { _property_id: propertyId, _rate_plan_id: data.id },
      );
      if (resolveError) throw new Error(resolveError.message);
      const { data: assignments, error: assignmentError } = await sb.from("staynas_rate_plan_room_types")
        .select("room_type_id").eq("property_id",propertyId).eq("rate_plan_id",data.id).eq("active",true);
      if (assignmentError) throw new Error(assignmentError.message);
      assertRatePlanRoomTypeAssignments(
        (resolved?.resolved_data ?? {}) as Record<string, unknown>,
        new Set((assignments ?? []).map((assignment: { room_type_id: string }) => assignment.room_type_id)),
      );
    }
    const { data: row, error } = await sb.rpc(
      "set_staynas_rate_plan_publication",
      {
        _rate_plan_id: data.id,
        _publication_status: data.publication_status,
        _active: data.active ?? null,
        _change_reason: data.change_reason,
      },
    );
    if (error) throw new Error(error.message);
    if (!row || row.property_id !== propertyId) throw new Error("Rate plan is not part of the active property.");
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


export const listStayNasRatePlanPublicationEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await (context.supabase as any).from("staynas_rate_plan_publication_events")
      .select("id,rate_plan_id,rate_plan_version,previous_status,new_status,previous_active,new_active,event_type,actor_id,change_reason,created_at")
      .eq("rate_plan_id",data.id).eq("property_id",propertyId).order("created_at",{ascending:false});
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listStayNasPublishedRatePlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const { data, error } = await (context.supabase as any).rpc(
      "get_staynas_published_rate_plans", { _property_id: propertyId },
    );
    if (error) throw new Error(error.message);
    return data ?? [];
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
    const { data: existingAssignment, error: existingAssignmentError } = await sb.from("staynas_rate_plan_room_types")
      .select("id").eq("property_id",propertyId).eq("rate_plan_id",data.rate_plan_id)
      .eq("room_type_id",data.room_type_id).maybeSingle();
    if (existingAssignmentError) throw new Error(existingAssignmentError.message);
    const query = existingAssignment
      ? sb.from("staynas_rate_plan_room_types").update({
          active:data.active,updated_by:context.userId,
        }).eq("id",existingAssignment.id).eq("property_id",propertyId)
      : sb.from("staynas_rate_plan_room_types").insert({
          property_id:propertyId,rate_plan_id:data.rate_plan_id,room_type_id:data.room_type_id,
          active:data.active,created_by:context.userId,updated_by:context.userId,
        });
    const { data: assignment, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return assignment;
  });


export const resolveStayNasRatePlanInheritance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const { data: resolved, error } = await (context.supabase as any).rpc(
      "resolve_staynas_rate_plan_inheritance",
      { _property_id: propertyId, _rate_plan_id: data.id },
    );
    if (error) throw new Error(error.message);
    return resolved;
  });


export const createStayNasRatePlanInheritanceSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await getActivePropertyId(context.supabase, context.userId);
    const { data: snapshot, error } = await (context.supabase as any).rpc(
      "create_staynas_rate_plan_inheritance_snapshot",
      { _property_id: propertyId, _rate_plan_id: data.id },
    );
    if (error) throw new Error(error.message);
    return snapshot;
  });
