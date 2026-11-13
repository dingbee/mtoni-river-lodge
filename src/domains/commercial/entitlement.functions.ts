import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  COMMERCIAL_FEATURE_CODES,
  COMMERCIAL_MODULE_CODES,
  commercialAddonSchema,
} from "./catalogue-contract";
import { commercialPackageCompositionSchema } from "./package-composition-contract";
import {
  resolveEntitlement,
  resolvePublishedAddonFeatureGrants,
  type EntitlementResolution,
} from "./entitlement-engine";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor, resolveVerifiedTenantActor } from "./subscription.functions";

type Result = { data: unknown; error: unknown | null };
type Query = PromiseLike<Result> & {
  select(columns?: string): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  or(filters: string): Query;
  maybeSingle(): Promise<Result>;
};
type AdminClient = {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): Promise<Result>;
};
type SubscriptionRow = {
  id: string;
  account_id: string;
  plan_code: "essential" | "professional" | "enterprise";
  plan_version: number;
  status: "pending_activation" | "trialing" | "active" | "suspended" | "cancelled" | "expired";
  addon_codes: string[];
  property_count: number;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
};
type GrantRule = {
  id: string;
  grant_type: "addon_feature" | "custom_feature" | "override" | "platform_restriction";
  orga¶»§q«^