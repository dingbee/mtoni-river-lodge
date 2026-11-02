import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateValue = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional().or(z.literal(""));
const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  taxCode: z.string().trim().max(40).optional().default(""),
  calculationType: z.enum(["inclusive_percent", "exclusive_percent", "fixed_per_night", "fixed_per_booking"]),
  rate: z.number().finite().min(0).max(100000000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).optional().or(z.literal("")),
  appliesTo: z.enum(["accommodation", "extras", "all"]),
  isCompound: z.boolean().default(false),
  active: z.boolean().default(true),
  validFrom: dateValue,
  validTo: dateValue,
}).refine((value) => !value.validFrom || !value.validTo || value.validTo >= value.validFrom, {
  message: "Valid-to date must be on or after valid-from date",
  path: ["validTo"],
});

async function requirePropertyAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("No authorized property selected");
  const { data: member, error: memberError } = await supabase
    .from("staynas_property_members").select("role,status")
    .eq("property_id", data).eq("user_id", userId).maybeSingle();
  if (memberError || !member || member.status !== "active" || !["owner", "manager", "admin"].includes(String(member.role))) {
    throw new Error("Forbidden: property owner or manager access is required");
  }
  return String(data);
}

export const listPropertyTaxRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyId = await requirePropertyAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("staynas_property_tax_rules")
      .select("id,name,tax_code,calculation_type,rate,currency,applies_to,is_compound,active,valid_from,valid_to,created_at,updated_at")
      .eq("property_id", propertyId).order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load property tax rules");
    return data ?? [];
  });

export const savePropertyTaxRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ruleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property, error: propertyError } = await (supabaseAdmin as any).from("staynas_properties")
      .select("currency").eq("id", propertyId).maybeSingle();
    if (propertyError || !property) throw new Error("Unable to resolve the selected property's currency");
    const propertyCurrency = String(property.currency ?? "").toUpperCase();
    const fixed = data.calculationType === "fixed_per_night" || data.calculationType === "fixed_per_booking";
    const currency = String(data.currency || (fixed ? propertyCurrency : "")).toUpperCase() || null;
    if (fixed && !currency) throw new Error("A property currency is required for fixed tax amounts");
    if (currency && propertyCurrency && currency !== propertyCurrency) {
      throw new Error(`Tax currency must match this property's booking currency (${propertyCurrency})`);
    }
    const payload = {
      property_id: propertyId,
      name: data.name,
      tax_code: data.taxCode || null,
      calculation_type: data.calculationType,
      rate: data.rate,
      currency,
      applies_to: data.appliesTo,
      is_compound: data.isCompound,
      active: data.active,
      valid_from: data.validFrom || null,
      valid_to: data.validTo || null,
      updated_at: new Date().toISOString(),
    };
    const query = data.id
      ? (supabaseAdmin as any).from("staynas_property_tax_rules").update(payload).eq("id", data.id).eq("property_id", propertyId).select("id").maybeSingle()
      : (supabaseAdmin as any).from("staynas_property_tax_rules").insert({ ...payload, created_at: new Date().toISOString() }).select("id").single();
    const { data: saved, error } = await query;
    if (error || !saved) throw new Error("Unable to save the property tax rule");
    return { id: saved.id };
  });

export const deactivatePropertyTaxRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const propertyId = await requirePropertyAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await (supabaseAdmin as any).from("staynas_property_tax_rules")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("property_id", propertyId).select("id").maybeSingle();
    if (error || !updated) throw new Error("Unable to deactivate the property tax rule");
    return { success: true };
  });
