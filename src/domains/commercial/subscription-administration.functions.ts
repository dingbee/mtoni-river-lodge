import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  resolveVerifiedFounderActor,
  resolveVerifiedTenantActor,
} from "./subscription.functions";

type AdminQueryResult = { data: unknown; error: unknown | null };
type AdminQuery = PromiseLike<AdminQueryResult> & {
  select(columns?: string): AdminQuery;
  eq(column: string, value: unknown): AdminQuery;
  maybeSingle(): Promise<AdminQueryResult>;
};
type CommercialAdmin = {
  from(table: string): AdminQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<AdminQueryResult>;
};

const commonInput = z.object({
  subscriptionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
});
const founderInput = commonInput.extend({
  command: z.enum([
    "activate_paid",
    "suspend",
    "reinstate",
    "cancel_immediately",
    "renewal_authorized",
  ]),
  reasonCode: z.string().trim().min(1).max(120).optional(),
  commercialAcceptanceRef: z.string().trim().min(1).max(300).optional(),
  periodEndsAt: z.string().datetime({ offset: true }).optional(),
});
const tenantCancellationInput = commonInput;

async function loadSubscriptionForAccount(
  admin: CommercialAdmin,
  subscriptionId: string,
  accountId?: string,
) {
  let query = admin.from("commercial_subscriptions")
    .select("id, account_id, status, quote_required, commercial_acceptance_ref, current_period_ends_at");
  query = query.eq("id", subscriptionId);
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error("Subscription was not found in the authorized commercial account.");
  return data as {
    id: string;
    account_id: string;
    status: string;
    quote_required: boolean;
    commercial_acceptance_ref: string | null;
    current_period_ends_at: string | null;
  };
}

/**
 * Founder-only lifecycle controls. The caller identity and founder authority
 * are re-resolved server-side; browser actor IDs/roles/tenant IDs are ignored.
 * Price composition is immutable and must already be resolved by CC-02.
 */
export const administerCommercialSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => founderInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as CommercialAdmin;
    const subscription = await loadSubscriptionForAccount(admin, data.subscriptionId);

    if (data.command === "activate_paid") {
      if (!data.commercialAcceptanceRef || !data.periodEndsAt) {
        throw new Error("Paid activation requires a verified commercial acceptance reference and future billing-period end.");
      }
      if (subscription.quote_required && !data.commercialAcceptanceRef) {
        throw new Error("Enterprise activation requires an accepted enterprise agreement.");
      }
    }
    if (data.command === "renewal_authorized" && !data.commercialAcceptanceRef) {
      throw new Error("Renewal authorization requires a recorded commercial acceptance reference.");
    }
    if (["suspend", "cancel_immediately"].includes(data.command) && !data.reasonCode) {
      throw new Error("A reason code is required for suspension or immediate cancellation.");
    }

    const { data: accountData, error: accountError } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status")
      .eq("id", subscription.account_id)
      .maybeSingle();
    const account = accountData as { id: string; organisation_id: string; status: string } | null;
    if (accountError || !account || account.status !== "active") {
      throw new Error("Active commercial account was not found.");
    }

    const { data: result, error } = await admin.rpc("commercial_apply_subscription_command", {
      _account_id: account.id,
      _subscription_id: subscription.id,
      _command: data.command,
      _idempotency_key: data.idempotencyKey,
      _actor_user_id: actor.userId,
      _actor_organisation_id: actor.organisationId,
      _actor_role: "founder_admin",
      _reason_code: data.reasonCode ?? null,
      _commercial_acceptance_ref: data.commercialAcceptanceRef ?? null,
      _period_ends_at: data.periodEndsAt ?? null,
    });
    if (error || !result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
      throw new Error("Commercial subscription command could not be completed.");
    }
    return result;
  });

/** Tenant admins may request cancellation at the end of the current trial/paid period. */
export const requestMyCommercialSubscriptionCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tenantCancellationInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") {
      throw new Error("Forbidden: tenant administrator authority is required to request cancellation.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as CommercialAdmin;
    const { data: accountData, error: accountError } = await admin
      .from("commercial_accounts")
      .select("id, organisation_id, status")
      .eq("organisation_id", actor.organisationId)
      .maybeSingle();
    const account = accountData as { id: string; organisation_id: string; status: string } | null;
    if (accountError || !account || account.status !== "active") {
      throw new Error("Active tenant commercial account was not found.");
    }

    const subscription = await loadSubscriptionForAccount(admin, data.subscriptionId, account.id);
    const { data: result, error } = await admin.rpc("commercial_apply_subscription_command", {
      _account_id: account.id,
      _subscription_id: subscription.id,
      _command: "request_cancellation",
      _idempotency_key: data.idempotencyKey,
      _actor_user_id: actor.userId,
      _actor_organisation_id: actor.organisationId,
      _actor_role: "tenant_admin",
      _reason_code: "tenant_cancellation_request",
      _commercial_acceptance_ref: null,
      _period_ends_at: null,
    });
    if (error || !result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
      throw new Error("Subscription cancellation request could not be completed.");
    }
    return result;
  });
