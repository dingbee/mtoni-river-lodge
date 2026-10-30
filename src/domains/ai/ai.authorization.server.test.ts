import { describe, expect, it, vi } from "vitest";
import { assertFounderAiAdmin } from "./ai.authorization.server";

describe("assertFounderAiAdmin", () => {
  it("allows an authenticated Nolmark founder administrator", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    await expect(assertFounderAiAdmin(supabase as never, "founder-user")).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("is_staynas_founder_ai_admin");
  });

  it("rejects tenant owners and staff", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    await expect(assertFounderAiAdmin(supabase as never, "tenant-user"))
      .rejects.toThrow("Nolmark founder administration only");
  });

  it("fails closed when the authorization RPC errors", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("RPC unavailable") }) };
    await expect(assertFounderAiAdmin(supabase as never, "founder-user"))
      .rejects.toThrow("Unable to verify founder AI administration access");
  });

  it("rejects an absent user before calling the database", async () => {
    const supabase = { rpc: vi.fn() };
    await expect(assertFounderAiAdmin(supabase as never, ""))
      .rejects.toThrow("Forbidden");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});


describe("getActivePropertyAiRoles", () => {
  function mockSupabase(contextResult: unknown, membershipResult: unknown) {
    const from = vi.fn((table: string) => {
      const result = table === "staynas_user_property_context" ? contextResult : membershipResult;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn().mockResolvedValue(result),
      };
      return builder;
    });
    return { from };
  }

  it("uses the role attached to the selected active property membership", async () => {
    const supabase = mockSupabase(
      { data: { property_id: "property-a" }, error: null },
      { data: { role: "manager" }, error: null },
    );
    const { getActivePropertyAiRoles } = await import("./ai.authorization.server");
    await expect(getActivePropertyAiRoles(supabase as never, "user-a")).resolves.toEqual({ propertyId: "property-a", roles: ["manager"] });
    expect(supabase.from).toHaveBeenNthCalledWith(1, "staynas_user_property_context");
    expect(supabase.from).toHaveBeenNthCalledWith(2, "staynas_property_members");
  });

  it("denies AI when no active property has been selected", async () => {
    const supabase = mockSupabase({ data: null, error: null }, { data: null, error: null });
    const { getActivePropertyAiRoles } = await import("./ai.authorization.server");
    await expect(getActivePropertyAiRoles(supabase as never, "user-a"))
      .rejects.toThrow("Select an active property");
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("fails closed when selected-property membership is missing", async () => {
    const supabase = mockSupabase(
      { data: { property_id: "property-a" }, error: null },
      { data: null, error: null },
    );
    const { getActivePropertyAiRoles } = await import("./ai.authorization.server");
    await expect(getActivePropertyAiRoles(supabase as never, "user-a"))
      .rejects.toThrow("No active membership");
  });
});
