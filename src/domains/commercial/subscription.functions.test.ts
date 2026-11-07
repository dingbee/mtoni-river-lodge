import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder: any = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: (input: any) => unknown) => ({ __handler: handler }),
    };
    return builder;
  },
}));

vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: mocks.adminFrom,
    rpc: mocks.adminRpc,
  },
}));

import {
  activateMyCommercialTrial,
  listCommercialAccountsForFounder,
  listMyCommercialSubscriptions,
} from "./subscription.functions";

const userId = "11111111-1111-4111-8111-111111111111";
const organisationId = "22222222-2222-4222-8222-222222222222";
const propertyId = "33333333-3333-4333-8333-333333333333";
const accountId = "44444444-4444-4444-8444-444444444444";
const subscriptionId = "55555555-5555-4555-8555-555555555555";

function query(response: any) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => response),
    insert: vi.fn(async () => ({ error: null })),
    then: (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return builder;
}

function makeContext(options: {
  role?: string;
  tenantAccess?: boolean;
  founderAccess?: boolean;
} = {}) {
  const rows: Record<string, any> = {
    staynas_user_property_context: { data: { property_id: propertyId }, error: null },
    staynas_properties: { data: { id: propertyId, organisation_id: organisationId, status: "active" }, error: null },
    staynas_property_members: { data: { role: options.role ?? "owner", status: "active" }, error: null },
    staynas_organisations: { data: { id: organisationId, status: "active" }, error: null },
  };

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
    },
    from: vi.fn((table: string) => query(rows[table] ?? { data: null, error: null })),
    rpc: vi.fn(async (name: string) => ({
      data: name === "commercial_is_founder_admin"
        ? options.founderAccess === true
        : options.tenantAccess !== false,
      error: null,
    })),
  };
  return { supabase, userId };
}

function configureAdmin() {
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === "commercial_accounts") {
      return query({
        data: { id: accountId, organisation_id: organisationId, status: "active" },
        error: null,
      });
    }
    if (table === "commercial_subscriptions") {
      return query({
        data: [{
          id: subscriptionId,
          account_id: accountId,
          plan_code: "professional",
          plan_version: 2,
          status: "pending_activation",
        }],
        error: null,
      });
    }
    if (table === "commercial_founder_tenant_config") {
      return query({ data: { founder_organisation_id: organisationId }, error: null });
    }
    return query({ data: null, error: null });
  });
  mocks.adminRpc.mockResolvedValue({
    data: { ok: true, status: "trialing", policyVersion: 7 },
    error: null,
  });
}

describe("CC-03 authenticated subscription administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureAdmin();
    process.env.STAYNAS_COMMERCIAL_TRIAL_POLICIES_JSON = JSON.stringify([{
      planCode: "professional",
      planVersion: 2,
      policyVersion: 7,
      enabled: true,
      durationDays: 14,
      startTrigger: "subscription_activated",
      effectiveFrom: null,
      effectiveTo: null,
    }]);
  });

  it("lists only the commercial account belonging to the verified active organisation", async () => {
    const context = makeContext();
    const result = await (listMyCommercialSubscriptions as any).__handler({ context });

    expect(result.account.id).toBe(accountId);
    expect(result.subscriptions[0].id).toBe(subscriptionId);
    expect(context.supabase.auth.getUser).toHaveBeenCalledOnce();
    expect(context.supabase.rpc).toHaveBeenCalledWith(
      "commercial_user_has_organisation_access",
      { _organisation_id: organisationId },
    );
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_accounts");
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_subscriptions");
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_audit_events");
  });

  it("rejects a user whose verified session has no active organisation access", async () => {
    const context = makeContext({ tenantAccess: false });

    await expect(
      (listMyCommercialSubscriptions as any).__handler({ context }),
    ).rejects.toThrow(/Forbidden/);

    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it("derives trial policy and actor identity on the server, not from browser input", async () => {
    const context = makeContext({ role: "owner" });
    const result = await (activateMyCommercialTrial as any).__handler({
      context,
      data: { subscriptionId, idempotencyKey: "uat-cc03-trial-0001" },
    });

    expect(result.status).toBe("trialing");
    expect(mocks.adminRpc).toHaveBeenCalledWith("commercial_activate_trial", expect.objectContaining({
      _account_id: accountId,
      _subscription_id: subscriptionId,
      _plan_code: "professional",
      _plan_version: 2,
      _policy_version: 7,
      _actor_user_id: userId,
      _actor_organisation_id: organisationId,
      _actor_role: "tenant_admin",
    }));
    expect(mocks.adminRpc.mock.calls[0][1]).not.toHaveProperty("actorUserId");
  });

  it("denies tenant staff from activating a trial and persists a denial audit", async () => {
    const context = makeContext({ role: "reception" });

    await expect(
      (activateMyCommercialTrial as any).__handler({
        context,
        data: { subscriptionId, idempotencyKey: "uat-cc03-trial-0002" },
      }),
    ).rejects.toThrow(/tenant owner or manager/);

    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_audit_events");
  });

  it("requires the dedicated founder predicate before reading global commercial accounts", async () => {
    const context = makeContext({ founderAccess: false });

    await expect(
      (listCommercialAccountsForFounder as any).__handler({ context }),
    ).rejects.toThrow(/founder administrator authority/);

    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it("allows global account listing only for a verified configured founder principal and audits it", async () => {
    const context = makeContext({ founderAccess: true });
    const result = await (listCommercialAccountsForFounder as any).__handler({ context });

    expect(result).toHaveLength(1);
    expect(context.supabase.rpc).toHaveBeenCalledWith(
      "commercial_is_founder_admin",
      { _principal_id: userId },
    );
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_founder_tenant_config");
    expect(mocks.adminFrom).toHaveBeenCalledWith("commercial_audit_events");
  });
});
