import { z } from "zod";

/**
 * CC02.05 founder administration policy contracts.
 *
 * IMPORTANT: caller context must be constructed from a verified server-side
 * identity/session and trusted tenant membership lookup. Never accept this
 * context directly from browser input. This pure policy evaluator is not a
 * replacement for server-side authentication, authorization or RLS.
 */
export const COMMERCIAL_ADMIN_ACTIONS = [
  "view_commercial_catalogue",
  "manage_commercial_catalogue",
  "manage_commercial_pricing",
  "manage_package_composition",
  "manage_trial_policy",
  "manage_commercial_accounts",
  "view_commercial_audit_log",
] as const;
export type CommercialAdminAction = (typeof COMMERCIAL_ADMIN_ACTIONS)[number];

export const COMMERCIAL_ADMIN_ROLES = [
  "founder_admin",
  "tenant_admin",
  "tenant_staff",
  "service_principal",
] as const;

export const commercialAdminActorContextSchema = z.object({
  principalId: z.string().trim().min(1).max(200),
  tenantId: z.string().trim().min(1).max(200),
  role: z.enum(COMMERCIAL_ADMIN_ROLES),
  identityVerified: z.literal(true),
  membershipVerified: z.literal(true),
});
export type CommercialAdminActorContext = z.infer<typeof commercialAdminActorContextSchema>;

export const commercialAdminAuthorizationInputSchema = z.object({
  actor: commercialAdminActorContextSchema,
  founderTenantId: z.string().trim().min(1).max(200),
  action: z.enum(COMMERCIAL_ADMIN_ACTIONS),
});
export type CommercialAdminAuthorizationInput = z.infer<typeof commercialAdminAuthorizationInputSchema>;

export interface CommercialAdminAuthorizationDecision {
  allowed: boolean;
  action: CommercialAdminAction;
  reason:
    | "authorized_founder_admin"
    | "unverified_identity"
    | "unverified_membership"
    | "wrong_tenant"
    | "insufficient_role";
}

/**
 * All global commercial administration is restricted to founder_admin within
 * the configured Nolmark CDMA founder tenant. Tenant admins/staff and service
 * principals are denied, including when they request read access.
 */
export function authorizeCommercialAdmin(
  rawInput: CommercialAdminAuthorizationInput,
): CommercialAdminAuthorizationDecision {
  const input = commercialAdminAuthorizationInputSchema.parse(rawInput);
  const { actor, action, founderTenantId } = input;

  if (actor.tenantId !== founderTenantId) {
    return { allowed: false, action, reason: "wrong_tenant" };
  }
  if (actor.role !== "founder_admin") {
    return { allowed: false, action, reason: "insufficient_role" };
  }
  return { allowed: true, action, reason: "authorized_founder_admin" };
}

export const commercialAdminAuditEventSchema = z.object({
  eventId: z.string().trim().min(1).max(200),
  requestId: z.string().trim().min(1).max(200),
  actorPrincipalId: z.string().trim().min(1).max(200),
  actorTenantId: z.string().trim().min(1).max(200),
  action: z.enum(COMMERCIAL_ADMIN_ACTIONS),
  resourceType: z.enum(["plan", "plan_version", "module", "addon", "price", "composition", "trial_policy", "commercial_account"]),
  resourceRef: z.string().trim().min(1).max(300),
  outcome: z.enum(["allowed", "denied", "succeeded", "failed"]),
  occurredAt: z.string().datetime({ offset: true }),
  reasonCode: z.string().trim().min(1).max(120).nullable(),
});
export type CommercialAdminAuditEvent = z.infer<typeof commercialAdminAuditEventSchema>;
