import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { rateOverrideSchema } from "@/domains/finance/rate-overrides";

async function activeProperty(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

export const listStayNasRateOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await activeProperty(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [property, plans, roomTypes, rooms, overrides, audit] = await Promise.all([
      sb.from("staynas_properties").select("id,name,currency,timezone").eq("id",propertyId).single(),
      sb.from("staynas_rate_plans").select("id,code,name,publication_status,active").eq("property_id",propertyId).order("name"),
      sb.rpc("get_staynas_rate_plan_room_types", { _property_id: propertyId }),
      sb.rpc("get_staynas_rate_override_rooms", { _property_id: propertyId }),
      sb.from("staynas_rate_overrides").select("*").eq("property_id",propertyId).order("created_at",{ascending:false}),
      sb.from("staynas_rate_override_audit").select("*").eq("property_id",propertyId).order("created_at",{ascending:false}).limit(100),
    ]);
    for (const result of [property,plans,roomTypes,rooms,overrides,audit]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      property: property.data,
      plans: plans.data ?? [],
      roomTypes: roomTypes.data ?? [],
      rooms: rooms.data ?? [],
      overrides: overrides.data ?? [],
      audit: audit.data ?? [],
    };
  });

export const createStayNasRateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const parsed = rateOverrideSchema.parse(d);
    const { id: _id, status: _status, ...input } = parsed;
    return input;
  })
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await activeProperty(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: property, error: propertyError } = await sb.from("staynas_properties")
      .select("currency").eq("id",propertyId).single();
    if (propertyError || !property?.currency) throw new Error("Property currency is not configured.");
    if (String(data.currency).toUpperCase() !== String(property.currency).toUpperCase()) {
      throw new Error("Override currency must match the active property currency.");
    }
    if (data.scope === "room_date") {
      const { data: result, error } = await sb.rpc("apply_staynas_room_date_rate_override", {
        _property_id: propertyId,
        _room_id: data.room_id,
        _stay_date: data.effective_from,
        _nightly_rate: data.nightly_rate,
        _reason: data.reason,
      });
      if (error) throw new Error(error.message);
      return result;
    }
    const { data: row, error } = await sb.from("staynas_rate_overrides").insert({
      ...data,
      property_id: propertyId,
      currency: String(property.currency).toUpperCase(),
      status: "pending",
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setStayNasRateOverrideStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    scope: z.enum(["room_date","room_type","rate_plan","rate_plan_room_type"]),
    status: z.enum(["approved","rejected","revoked"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await activeProperty(context.supabase, context.userId);
    const sb: any = context.supabase;
    if (data.scope === "room_date" && data.status === "approved") {
      const { data: result, error } = await sb.rpc("approve_staynas_room_date_rate_override", { _override_id: data.id });
      if (error) throw new Error(error.message);
      return result;
    }
    if (data.scope === "room_date" && data.status === "revoked") {
      const { data: result, error } = await sb.rpc("revoke_staynas_room_date_rate_override", { _override_id: data.id });
      if (error) throw new Error(error.message);
      return result;
    }
    const { data: row, error } = await sb.from("staynas_rate_overrides")
      .update({ status: data.status })
      .eq("id",data.id).eq("property_id",propertyId).eq("status",data.status === "revoked" ? "approved" : "pending")
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });
