import { describe, expect, it } from "vitest";
import {
  authorizeCommercialAdmin,
  commercialAdminActorContextSchema,
  commercialAdminAuditEventSchema,
  type CommercialAdminAuthorizationInput,
} from "./founder-administration-contract";

const founderActor = {
  principalId: "founder-user-1",
  tenantId: "nolmark-founder-tenant",
  role: "founder_admin" as const,
  identityVerified: true as const,
  membershipVerified: true as const,
};
const founderInput: CommercialAdminAuthorizationInput = {
  actor: founderActor,
  founderTenantId: "nolmark-founder-tenant",
  action: "manage_commercial_pricing",
};

describe("CC02.05 founder-only commercial administration", () => {
  it("authorizes a verified founder admin inside the configured founder tenant", () => {
    expect(authorizeCommercialAdmin(founderInput)).toEqual({
      allowed: true,
      action: "manage_commercial_pricing",
      reason: "authorized_founder_admin",
    });
  });

  it("denies tenant administrators even when identity and membership are verified", () => {
    expect(authorizeCommercialAdmin({
      ...founderInput,
      actor: { ...founderActor, tenantId: "mtoni-tenant", role: "tenant_admin" },
    })).toEqual({
      allowed: false,
      action: "manage_commercial_pricing",
      reason: "wrong_tenant",
    });
  });

  it("denies tenant admins in founder tenant context without founder role", () => {
    expect(authorizeCommercialAdmin({
      ...founderInput,
      actor: { ...founderActor, role: "tenant_admin" },
    }).reason).toBe("insufficient_role");
  });

  it("denies tenant staff and service principals", () => {
    for (const role of ["tenant_staff", "service_principal"] as const) {
      expect(authorizeCommercialAdmin({
        ...founderInput,
        actor: { ...founderActor, role },
      }).allowed).toBe(false);
    }
  });

  it("fails closed for unverified identity or membership context", () => {
    expect(commercialAdminActorContextSchema.safeParse({
      ...founderActor,
      identityVerified: false,
    }).success).toBe(false);
    expect(commercialAdminActorContextSchema.safeParse({
      ...founderActor,
      membershipVerified: false,
    }).success).toBe(false);
  });

  it("restricts every commercial administration action to the founder authority", () => {
    const actions = [
      "view_commercial_catalogue",
      "manage_commercial_catalogue",
      "manage_commercial_pricing",
      "manage_package_composition",
      "manage_trial_policy",
      "manage_commercial_accounts",
      "view_commercial_audit_log",
    ] as const;
    for (const action of actions) {
      expect(authorizeCommercialAdmin({ ...founderInput, action }).allowed).toBe(true);
      expect(authorizeCommercialAdmin({
        ...founderInput,
        action,
        actor: { ...founderActor, role: "tenant_admin" },
      }).allowed).toBe(false);
    }
  });

  it("validates immutable audit evidence fields", () => {
    expect(commercialAdminAuditEventSchema.safeParse({
      eventId: "evt-001",
      requestId: "req-001",
      actorPrincipalId: founderActor.principalId,
      actorTenantId: founderActor.tenantId,
      action: "manage_commercial_pricing",
      resourceType: "price",
      resourceRef: "professional_tzs_monthly_v1",
      outcome: "succeeded",
      occurredAt: "2026-11-05T10:00:00Z",
      reasonCode: null,
    }).success).toBe(true);
  });

  it("rejects malformed audit evidence", () => {
    expect(commercialAdminAuditEventSchema.safeParse({
      eventId: "",
      requestId: "req-001",
      actorPrincipalId: founderActor.principalId,
      actorTenantId: founderActor.tenantId,
      action: "manage_commercial_pricing",
      resourceType: "price",
      resourceRef: "professional_tzs_monthly_v1",
      outcome: "succeeded",
      occurredAt: "not-a-date",
      reasonCode: null,
    }).success).toBe(false);
  });
});
