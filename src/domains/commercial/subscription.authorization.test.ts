import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.adminFrom },
}));

import {
  actorRoleForMembership,
  loadTrialPolicies,
  resolveVerifiedFounderActor,
  resolveVerifiedTenantActor,
} from "./subscription.functions";

const userId = "11111111-1111-4111-8111-111111111111";
const organisationId = "22222222-2222-4222-8222-222222222222";
const propertyId = "33333333-3333-4333-8333-333333333333";

type MockResult = { data: unknown; error: unknown | null };
type MockQuery = {
  select: (columns?: string) => MockQuery;
  eq: (column: string, value: unknown) => MockQuery;
  maybeSingle: () => Promise<MockResult>;
};

function query(response: MockResult): MockQuery {
  const builder: MockQuery = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => response,
  };
  return builder;
}

function makeContext(options: {
  authUserId?: string;
  userId?: string;
  role?: string;
  tenantAccess?: boolean;
  founderAccess?: boolean;
} = {}) {
  const rows: Record<string, MockResult> = {
    staynas_user_property_context: { data: { property_id: propertyId }, error: null },
    staynas_properties: { data: { id: propertyId, organisation_id: organisationId, status: "active" }, error: null },
    staynas_property_members: { data: { role: options.role ?? "owner", status: "active" }, error: null },
    staynas_organisations: { data: { id: organisationId, status: "active" }, error: null },
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: options.authUserId ?? userId } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => query(rows[table] ?? { data: null, error: null })),
      rpc: vi.fn(async (name: string) => ({
        data: name === "commercial_is_founder_admin"
          ? options.founderAccess === true
          : options.tenantAccess !== false,
        error: null,
      })),
    },
    userId: options.userId ?? userId,
  };
}

describe("CC-03 server-side identity and authority resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === "commercial_founder_tenant_config") {
        return query({ data: { founder_organisation_id: organisationId }, error: null });
      }
      return query({ data: null, error: null });
    });
  });

  it("maps only recognised property administration roles to tenant_admin", () => {
    expect(actorRoleForMembership("owner")).toBe("tenant_admin");
    expect(actorRoleForMembership("manager")).toBe("tenant_admin");
    expect(actorRoleForMembership("reception")).toBe("tenant_staff");
  });

  it("derives tenant actor identity and organisation from the verified session and active membership", async () => {
    const context = makeContext({ role: "manager" });
    const actor = await resolveVerifiedTenantActor(context);

    expect(actor).toEqual({
      userId,
      organisationId,
      propertyId,
      membershipRole: "manager",
      actorRole: "tenant_admin",
    });
    expect(context.supabase.auth.getUser).toHaveBeenCalledOnce();
    expect(context.supabase.rpc).toHaveBeenCalledWith(
      "commercial_user_has_organisation_access",
      { _organisation_id: organisationId },
    );
  });

  it("rejects a client-supplied user ID that differs from the verified Supabase user", async () => {
    const context = makeContext({
      authUserId: userId,
      userId: "99999999-9999-4999-8999-999999999999",
    });

    await expect(resolveVerifiedTenantActor(context)).rejects.toThrow(/Unauthenticated/);
    expect(context.supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an organisation outside the caller's active membership scope", async () => {
    const context = makeContext({ tenantAccess: false });

    await expect(resolveVerifiedTenantActor(context)).rejects.toThrow(/Forbidden/);
  });

  it("requires the caller-bound founder predicate and the configured founder organisation", async () => {
    const context = makeContext({ founderAccess: true });
    const actor = await resolveVerifiedFounderActor(context);

    expect(actor.actorRole).toBe("founder_admin");
    expect(actor.userId).toBe(userId);
    expect(actor.organisationId).toBe(organisationId);
    expect(context.supabase.rpc).toHaveBeenCalledWith(
      "commercial_is_founder_admin",
      { _principal_id: userId },
    );
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_founder_tenant_config");
  });

  it("denies founder access without the dedicated commercial founder mapping", async () => {
    const context = makeContext({ founderAccess: false });

    await expect(resolveVerifiedFounderActor(context)).rejects.toThrow(/founder administrator authority/);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it("loads only schema-valid trial policies from the current founder-published database version", async () => {
    const policy = {
      planCode: "professional",
      planVersion: 2,
      policyVersion: 7,
      enabled: true,
      durationDays: 14,
      startTrigger: "subscription_activated",
      effectiveFrom: null,
      effectiveTo: null,
    };
    const admin = {
      from: vi.fn((table: string) => query(table === "commercial_policy_config_current"
        ? { data: { version_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, error: null }
        : { data: { payload: [policy] }, error: null })),
    };

    await expect(loadTrialPolicies(admin as never)).resolves.toEqual([policy]);
    expect(admin.from).toHaveBeenCalledWith("commercial_policy_config_current");
    expect(admin.from).toHaveBeenCalledWith("commercial_policy_config_versions");
  });

  it("fails closed when no founder-published trial policy version exists", async () => {
    const admin = {
      from: vi.fn(() => query({ data: null, error: null })),
    };
    await expect(loadTrialPolicies(admin as never)).rejects.toThrow(/not published/);
  });
});
