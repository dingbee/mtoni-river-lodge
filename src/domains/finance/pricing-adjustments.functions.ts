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
  tax_rule_ids: z.array(z.string().uuid()).default([]).refine(ids=>new Set(ids).size===ids.length,"Tax rules must be unique."),
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
  eligible_room_ids: z.array(z.string().uuid()).default([]).refine(ids=>new Set(ids).size===ids.length,"Eligible rooms must be unique."),
  eligible_rate_plan_ids: z.array(z.string().uuid()).default([]).refine(ids=>new Set(ids).size===ids.length,"Eligible rate plans must be unique."),
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
}).refine(v => !v.valid_from || !v.valid_to || v.valid_to >= v.valid_from, { message:"Promotion expiry must follow its start.", path:["valid_to"] })
  .refine(v => v.discount_type!=="percentage" || v.discount_value<=100, { message:"Percentage discounts cannot exceed 100%.", path:["discount_value"] });

async function assertPropertyCurrency(supabase:any,propertyId:string,currency?:string|null) {
  if(!currency) return;
  const {data,error}=await supabase.from("staynas_properties").select("currency").eq("id",propertyId).single();
  if(error) throw new Error(error.message);
  if(String(currency).toUpperCase()!==String(data.currency).toUpperCase()) {
    throw new Error("Pricing adjustment currency must match the active property's configured currency.");
  }
}

async function savePropertyRecord(
  supabase: any, userId: string, propertyId: string, table: string, data: Record<string, unknown>,
) {
  const { id, ...record } = data;
  const payload = { ...record, property_id: propertyId, updated_by: userId };
  if (id) {
    const { data: row, error } = await supabase.from(table).update(payload)
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
    const [property, taxes, fees, promotions, audit, rooms, ratePlans, extras] = await Promise.all([
      sb.from("staynas_properties").select("id,name,currency,timezone").eq("id",propertyId).single(),
      sb.from("staynas_property_tax_rules").select("*").eq("property_id",propertyId).order("priority").order("name"),
      sb.from("staynas_property_fee_rules").select("*").eq("property_id",propertyId).order("priority").order("name"),
      sb.from("staynas_property_promotions").select("*").eq("property_id",propertyId).order("priority").order("name"),
      sb.from("staynas_pricing_configuration_audit").select("*").eq("property_id",propertyId).order("created_at",{ascending:false}).limit(100),
      sb.from("rooms").select("id,name").eq("property_id",propertyId).order("name"),
      sb.from("staynas_rate_plans").select("id,name").eq("property_id",propertyId).order("name"),
      sb.from("extras").select("slug,name").eq("property_id",propertyId).eq("active",true).order("name"),
    ]);
    for (const result of [property,taxes,fees,promotions,audit,rooms,ratePlans,extras]) if (result.error) throw new Error(result.error.message);
    return { property:property.data, taxes:taxes.data??[], fees:fees.data??[], promotions:promotions.data??[], audit:audit.data??[], rooms:rooms.data??[], ratePlans:ratePlans.data??[], extras:extras.data??[] };
  });

export const savePricingTaxRule = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>taxSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    await assertPropertyCurrency(context.supabase,propertyId,data.currency);
    if(data.calculation_type==="inclusive_percent"&&data.tax_mode!=="inclusive") throw new Error("Inclusive percentage rules must use inclusive tax mode.");
    if(data.calculation_type==="exclusive_percent"&&data.tax_mode!=="exclusive") throw new Error("Exclusive percentage rules must use exclusive tax mode.");
    return savePropertyRecord(context.supabase,context.userId,propertyId,"staynas_property_tax_rules",data as Record<string,unknown>);
  });

export const savePricingFeeRule = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>feeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    await assertPropertyCurrency(context.supabase,propertyId,data.currency);
    if(data.tax_rule_ids.length){
      const {data:rows,error}=await (context.supabase as any).from("staynas_property_tax_rules")
        .select("id").eq("property_id",propertyId).in("id",data.tax_rule_ids);
      if(error) throw new Error(error.message);
      if((rows??[]).length!==data.tax_rule_ids.length) throw new Error("A selected tax rule does not belong to the active property.");
    }
    return savePropertyRecord(context.supabase,context.userId,propertyId,"staynas_property_fee_rules",data as Record<string,unknown>);
  });

export const savePricingPromotion = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>promotionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    await assertPropertyCurrency(context.supabase,propertyId,data.currency);
    const sb:any=context.supabase;
    if(data.eligible_room_ids.length){
      const {data:rooms,error}=await sb.from("rooms").select("id").eq("property_id",propertyId).in("id",data.eligible_room_ids);
      if(error) throw new Error(error.message);
      if((rooms??[]).length!==data.eligible_room_ids.length) throw new Error("An eligible room does not belong to the active property.");
    }
    if(data.eligible_rate_plan_ids.length){
      const {data:plans,error}=await sb.from("staynas_rate_plans").select("id").eq("property_id",propertyId).in("id",data.eligible_rate_plan_ids);
      if(error) throw new Error(error.message);
      if((plans??[]).length!==data.eligible_rate_plan_ids.length) throw new Error("An eligible rate plan does not belong to the active property.");
    }
    return savePropertyRecord(context.supabase,context.userId,propertyId,"staynas_property_promotions",data as Record<string,unknown>);
  });


const previewSchema = z.object({
  room_id:z.string().uuid(),
  check_in:z.string().date(),
  check_out:z.string().date(),
  adults:z.number().int().min(1).max(20),
  children_below_6:z.number().int().min(0).max(20).default(0),
  children_7_plus:z.number().int().min(0).max(20).default(0),
  extras:z.array(z.object({slug:z.string().min(1).max(100),quantity:z.number().int().min(1).max(20)})).max(20).default([]),
  rate_plan_id:z.string().uuid().nullable().optional(),
  promo_code:z.string().trim().max(64).nullable().optional(),
  guest_email:z.string().trim().email().max(255).nullable().optional(),
}).refine(v=>v.check_out>v.check_in,{message:"Check-out must be after check-in.",path:["check_out"]});

export const previewPricingAdjustments = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown)=>previewSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const propertyId=await activeFinanceProperty(context.supabase,context.userId);
    const sb: any = context.supabase;
    const { data: quote, error } = await sb.rpc("preview_staynas_pricing_adjustments",{
      _property_id:propertyId,
      _room_id:data.room_id,
      _check_in:data.check_in,
      _check_out:data.check_out,
      _adults:data.adults,
      _children_below_6:data.children_below_6,
      _children_7_plus:data.children_7_plus,
      _extras:data.extras,
      _rate_plan_id:data.rate_plan_id??null,
      _promo_code:data.promo_code?.trim()||null,
      _guest_email:data.guest_email?.trim()||null,
    });
    if(error) throw new Error(error.message);
    if(!quote) throw new Error("Pricing preview returned no result.");
    if((quote as any).ok===false) throw new Error(`Pricing preview rejected [${(quote as any).error_code??"INVALID_PRICING_CONTEXT"}]: ${(quote as any).message??"Configuration is not eligible"}`);
    return quote;
  });
