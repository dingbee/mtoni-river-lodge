import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

async function activeFinanceProperty(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

const dateValue = z.string().date().nullable().optional();
const base = {
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  priority: z.number().int().min(0).max(10000).default(100),
  active: z.boolean().default(true),
};
const taxSchema = z.object({
  ...base,
  tax_code: z.string().trim().max(60).nullable().optional(),
  calculation_type: z.enum(["inclusive_percent","exclusive_percent","fixed_per_night","fixed_per_booking"]),
  rate: z.number().min(0).max(100000000),
  currency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  applies_to: z.enum(["accommodation","extras","all"]).default("accommodation"),
  is_compound: z.boolean().default(false),
  valid_from: dateValue,
  valid_to: dateValue,
  tax_mode: z.enum(["inclusive","exclusive"]).default("exclusive"),
  taxable_components: z.array(z.enum(["accommodation","extras","fee"])).min(1).default(["accommodation","extras"]),
  jurisdiction_code: z.string().trim().max(32).nullable().optional(),
  display_label: z.string().trim().max(120).nullable().optional(),
}).refine(v => !v.valid_from || !v.valid_to || v.valid_to >= v.valid_from, { message:"End date must be on or after start date.", path:["valid_to"] });

const feeSchema = z.object({
  ...base,
  code: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().trim().max(1000).nullable().optional(),
  calculation_type: z.enum(["fixed","percentage","per_night","per_guest","per_booking","per_room"]),
  amount: z.number().min(0).max(100000000),
  currency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  applies_to: z.array(z.enum(["accommodation","extras"])).min(1).default(["accommodation"]),
  taxable: z.boolean().default(false),
  tax_rule_ids: z.array(z.string().uuid()).default([]),
  minimum_amount: z.number().min(0).nullable().optional(),
  maximum_amount: z.number().min(0).nullable().optional(),
  valid_from: dateValue,
  valid_to: dateValue,
}).refine(v => !v.valid_from || !v.valid_to || v.valid_to >= v.valid_from, { message:"End date must be on or after start date.", path:["valid_to"] })
  .refine(v => v.maximum_amount == null || v.minimum_amount == null || v.maximum_amount >= v.minimum_amount, { message:"Maximum fee must be at least the minimum fee.", path:["maximum_amount"] });

const promotionSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(60).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  discount_type: z.enum(["percentage","fixed"]),
  discount_value: z.number().positive().max(100000000),
  currency: z.string().trim().length(3).toUpperCase().nullable().optional(),
  eligible_room_ids: z.array(z.string().uuid()).default([]),
  eligible_rate_plan_ids: z.array(z.string().uuid()).default([]),
  minimum_nights: z.number().int().min(1).max(365).default(1),
  minimum_booking_value: z.number().min(0).default(0),
  booking_window_from: dateValue,
  booking_window_to: dateValue,
  stay_from: dateValue,
  stay_to: dateValue,
  valid_from: z.string().datetime().nullable().optional(),
  valid_to: z.string().datetime().nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  per_guest_limit: z.number().int().positive().nullable().optional(),
  auto_apply: z.boolean().default(false),
  stackable: z.boolean().default(false),
  priority: z.number().int().min(0).max(10000).default(100),
  status: z.enum(["draft","scheduled","active","suspended","revoked","expired"]).default("draft"),
}).refine(v => !v.valid_from || !v.valid_to || v.valid_to >= v.valid_from, { message:"Promotion expiry must follow its start.", path:["valid_to"] });

async function savePropertyRecord(
  supabase: any, userId: string, propertyId: string, table: string, data: Record<string, unknown>,
) {
  const payload = { ...data, property_id: propertyId, updated_by: userId };
  if (data.id) {
    const { id, ...changes } = payload;
    const { data: row, error } = await supabase.from(table).update(changes)
      .eq("id", id).eq("property_id", propertyId).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  }
  const { data: row, error } = await supabase.from(table)
    .insert({ ...payload, created_by: userId }).select("*").single();
  if (error) throw new Error(error.message);
  return row;
}

export const listPricingAdjustments = createServerFn({ method:"GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId = await activeFinanceProperty(context.supabase, context.userId);
    const sb: any = context.supabase;
    const [property, taxes, fees, promotions, audit, rooms, ratePlans] = await Promise.all([
      sb.from("staynas_properties").select("id,name,currency,timezone").eq("id",propertyId).single(),
      sb.from("staynas_property_tax_rules").select("*").eq("property_id",propertyId).order("priority").order("name"),
      sb.from("staynas_property_fee_rules").select("*").eq("property_id",propertyId).order("priority").order("name"),
      sb.from("staynas_property_promotions").select("*").eq("property_id",propertyId).order("priority").order("name"),
      sb.from("staynas_pricing_configuration_audit").select("*").eq("property_id",propertyId).order("created_at",{ascending:false}).limit(100),
      sb.from("rooms").select("id,name").eq("property_id",propertyId).order("name"),
      sb.from("staynas_rate_plans").select("id,name").eq("property_id",propertyId).order("name"),
    ]);
    for (const result of [property,taxes,fees,promotions,audit,rooms,ratePlans]) if (result.error) throw new Error(result.error.message);
    return { property:property.data, taxes:taxes.data??[], fees:fees.data??[], promotions:promotions.data??[], audit:audit.data??[], rooms:rooms.data??[], ratePlans:ratePlans.data??[] };
  });

export const savePricingTaxRule = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>taxSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    return savePropertyRecord(context.supabase,context.userId,propertyId,"staynas_property_tax_rules",data as Record<string,unknown>);
  });

export const savePricingFeeRule = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>feeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    return savePropertyRecord(context.supabase,context.userId,propertyId,"staynas_property_fee_rules",data as Record<string,unknown>);
  });

export const savePricingPromotion = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>promotionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    return savePropertyRecord(context.supabase,context.userId,propertyId,"staynas_property_promotions",data as Record<string,unknown>);
  });
