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
      sb.from("staynas_rate_plans").select("id,code,name,currency,publication_status,active").eq("property_id",propertyId).order("name"),
      sb.rpc("get_staynas_rate_plan_room_types", { _property_id: propertyId }),
      sb.from("rooms").select("id,name,catalogue_type_id,currency").eq("property_id",propertyId).eq("status","active").order("name"),
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
      rooms: (rooms.data ?? []).map((room: any) => ({ ...room, room_type_id: room.catalogue_type_id })),
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
    let expectedCurrency = "";
    if (data.scope === "room_date") {
      const { data: room, error } = await sb.from("rooms")
        .select("currency").eq("id",data.room_id).eq("property_id",propertyId).maybeSingle();
      if (error || !room) throw new Error("Override room is not part of the active property.");
      expectedCurrency = String(room.currency ?? "").toUpperCase();
    } else if (data.scope === "room_type") {
      const { data: rows, error } = await sb.from("rooms")
        .select("currency").eq("catalogue_type_id",data.room_type_id).eq("property_id",propertyId).eq("status","active");
      if (error || !rows?.length) throw new Error("Override room type has no active rooms in this property.");
      const currencies = Array.from(new Set(rows.map((row: any) => String(row.currency ?? "").toUpperCase())));
      if (currencies.length !== 1) throw new Error("A room-type override cannot span rooms with different transaction currencies.");
      expectedCurrency = currencies[0];
    } else {
      const { data: plan, error } = await sb.from("staynas_rate_plans")
        .select("currency").eq("id",data.rate_plan_id).eq("property_id",propertyId).maybeSingle();
      if (error || !plan) throw new Error("Override rate plan is not part of the active property.");
      expectedCurrency = String(plan.currency ?? "").toUpperCase();
    }
    if (!/^[A-Z]{3}$/.test(expectedCurrency)) throw new Error("The selected pricing source has no valid transaction currency.");
    if (String(data.currency).toUpperCase() !== expectedCurrency) {
      throw new Error(`Override currency must match the selected pricing source currency (${expectedCurrency}).`);
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
      currency: expectedCurrency,
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
