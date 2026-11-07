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

type PolicyRow = {
  id: string;
  policy_type: typeof policyTypes[number];
  version: number;
  status: "draft" | "published" | "retired";
  payload: unknown;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
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

function assertPayload(policyType: typeof policyTypes[number], payload: unknown) {
  return policyPayloadSchemas[policyType].parse(payload);
}

/** Founder-only read. Service-role access never reaches the browser directly. */
export const listFounderCommercialPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AdminClient;
    const { data, error } = await admin.from("commercial_policy_config_versions")
      .select("id, policy_type, version, status, payload, effective_from, effective_to, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load founder commercial policy configuration.");
    return (data ?? []) as PolicyRow[];
  });

/** Founder-only, schema-validated, append-only configuration write. */
export const saveFounderCommercialPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const payload = assertPayload(data.policyType, data.payload);
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
    const { data: id, error } = await supabase.rpc("commercial_record_policy_config", {
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
    return data ?? [];
  });
