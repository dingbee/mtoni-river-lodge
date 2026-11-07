import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor } from "./subscription.functions";
import {
  commercialPlanSchema,
  commercialPlanVersionSchema,
  commercialModuleSchema,
  commercialPlanModuleSchema,
  commercialAddonSchema,
} from "./catalogue-contract";
import { commercialPlanPriceSchema, commercialAddonPriceSchema } from "./pricing-contract";
import { commercialTrialPolicySchema } from "./trial-configuration-contract";
import { commercialPackageCompositionSchema, commercialAddonCompatibilitySchema } from "./package-composition-contract";

const policyTypes = ["catalogue", "pricing", "composition", "trial_policy"] as const;
const policyTypeSchema = z.enum(policyTypes);
const policyPayloadSchemas = {
  catalogue: z.object({
    plans: z.array(commercialPlanSchema),
    planVersions: z.array(commercialPlanVersionSchema),
    modules: z.array(commercialModuleSchema),
    planModules: z.array(commercialPlanModuleSchema),
    addons: z.array(commercialAddonSchema),
  }),
  pricing: z.object({
    planPrices: z.array(commercialPlanPriceSchema),
    addonPrices: z.array(commercialAddonPriceSchema),
  }),
  composition: z.object({
    compositions: z.array(commercialPackageCompositionSchema),
    compatibilityRules: z.array(commercialAddonCompatibilitySchema),
  }),
  trial_policy: z.array(commercialTrialPolicySchema),
};

const saveInput = z.object({
  policyType: policyTypeSchema,
  status: z.enum(["draft", "published"]),
  payload: z.unknown(),
  effectiveFrom: z.string().date().nullable().optional(),
  effectiveTo: z.string().date().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "Effective end date must not precede start date" });
  }
});

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type PolicyRecord = {
  id: string;
  policy_type: typeof policyTypes[number];
  version: number;
  status: "draft" | "published" | "retired";
  payload: JsonValue;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
};
type PolicyAuditRecord = {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_ref: string;
  outcome: string;
  occurred_at: string;
  metadata: JsonValue;
};
type QueryResult = { data: unknown; error: unknown | null };
type Query = PromiseLike<QueryResult> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  limit(count: number): Query;
  maybeSingle(): Promise<QueryResult>;
};
type AdminClient = { from(table: string): Query };

function assertPayload(
  policyType: typeof policyTypes[number],
  payload: unknown,
  status: "draft" | "published",
) {
  const parsed = policyPayloadSchemas[policyType].parse(payload);
  if (status !== "published") return parsed;

  if (policyType === "catalogue") {
    const codes = new Set((parsed as z.infer<typeof policyPayloadSchemas.catalogue>).plans.map((plan) => plan.code));
    if (codes.size !== 3 || !["essential", "professional", "enterprise"].every((code) => codes.has(code as "essential" | "professional" | "enterprise"))) {
      throw new Error("A published catalogue must define Essential, Professional and Enterprise.");
    }
  }
  if (policyType === "pricing") {
    const prices = (parsed as z.infer<typeof policyPayloadSchemas.pricing>).planPrices;
    const combinations = new Set(prices.map((price) => `${price.planCode}:${price.currency}:${price.billingTerm}`));
    const required = ["essential", "professional", "enterprise"].flatMap((plan) =>
      ["TZS", "USD"].flatMap((currency) => ["monthly", "annual"].map((term) => `${plan}:${currency}:${term}`)),
    );
    if (!required.every((key) => combinations.has(key))) {
      throw new Error("Published pricing must explicitly cover all three plans, both supported currencies and both billing terms.");
    }
  }
  if (policyType === "composition") {
    const compositions = (parsed as z.infer<typeof policyPayloadSchemas.composition>).compositions;
    const plans = new Set(compositions.map((item) => item.planCode));
    if (!["essential", "professional", "enterprise"].every((code) => plans.has(code as "essential" | "professional" | "enterprise"))) {
      throw new Error("Published package composition must define all three commercial plans.");
    }
  }
  if (policyType === "trial_policy") {
    const policies = parsed as z.infer<typeof policyPayloadSchemas.trial_policy>;
    const plans = new Set(policies.map((item) => item.planCode));
    if (policies.length === 0 || !["essential", "professional", "enterprise"].every((code) => plans.has(code as "essential" | "professional" | "enterprise"))) {
      throw new Error("Published trial policy must define the approved 14-day trial for all three plans.");
    }
  }
  return parsed;
}

/** Founder-only read. Service-role access never reaches the browser directly. */
export const listFounderCommercialPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AdminClient;
    const [{ data, error }, { data: currentData, error: currentError }] = await Promise.all([
      admin.from("commercial_policy_config_versions")
        .select("id, policy_type, version, status, payload, effective_from, effective_to, created_at")
        .order("created_at", { ascending: false }),
      admin.from("commercial_policy_config_current").select("policy_type, version_id"),
    ]);
    if (error || currentError) throw new Error("Unable to load founder commercial policy configuration.");
    const currentByType = new Map(
      ((currentData ?? []) as Array<{ policy_type: typeof policyTypes[number]; version_id: string }>)
        .map((row) => [row.policy_type, row.version_id]),
    );
    return ((data ?? []) as PolicyRecord[]).map((row) => ({
      ...row,
      is_current: currentByType.get(row.policy_type) === row.id,
    }));
  });

/** Founder-only, schema-validated, append-only configuration write. */
export const saveFounderCommercialPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const payload = assertPayload(data.policyType, data.payload, data.status);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AdminClient;
    const { data: latest, error: latestError } = await admin.from("commercial_policy_config_versions")
      .select("version")
      .eq("policy_type", data.policyType)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error("Unable to determine the next policy version.");
    const latestVersion = (latest as { version?: number } | null)?.version ?? 0;
    const version = latestVersion + 1;

    const supabase = context.supabase as SupabaseClient<Database>;
    const rpc = supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown | null }>;
    const { data: id, error } = await rpc("commercial_record_policy_config", {
      _policy_type: data.policyType,
      _version: version,
      _status: data.status,
      _payload: payload,
      _effective_from: data.effectiveFrom ?? null,
      _effective_to: data.effectiveTo ?? null,
    });
    if (error || typeof id !== "string") {
      throw new Error("Commercial policy configuration could not be saved. Founder authority and database constraints were rechecked.");
    }
    return {
      id,
      version,
      policyType: data.policyType,
      status: data.status,
      actorUserId: actor.userId,
    };
  });

/** Founder-only audit view for policy changes; no tenant-side audit access. */
export const listFounderCommercialPolicyAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AdminClient;
    const { data, error } = await admin.from("commercial_audit_events")
      .select("id, actor_user_id, action, resource_ref, outcome, occurred_at, metadata")
      .eq("action", "commercial_policy_config.created")
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Unable to load founder commercial policy audit evidence.");
    return (data ?? []) as PolicyAuditRecord[];
  });
