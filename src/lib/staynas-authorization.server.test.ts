import { describe, expect, it, vi } from "vitest";
import { requireStayNasModuleAccess, requireStayNasPropertyRole, requireStayNasStaffAccess, requireStayNasCoreStaffAccess, requireStayNasFounderAdmin } from "./staynas-authorization.server";

function clientWithPropertyRoles(roles: string[], error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: roles, error }),
  } as any;
}

describe("requireStayNasModuleAccess", () => {
  it("requires an authenticated user context", async () => {
    const client = clientWithPropertyRoles(["owner"]);
    await expect(
      requireStayNasModuleAccess(client, "", "finance"),
    ).rejects.toThrow("Forbidden");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("authorizes using the active property's owner membership", async () => {
    const client = clientWithPropertyRoles(["owner"]);
    await expect(
      requireStayNasModuleAccess(client, "user-1", "finance"),
    ).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("staynas_current_property_roles");
  });

  it("does not use legacy global roles to authorize a property module", async () => {
    const client = clientWithPropertyRoles([]);
    await expect(
      requireStayNasModuleAccess(client, "user-2", "reservations"),
    ).rejects.toThrow("Forbidden");
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("staynas_current_property_roles");
  });

  it("supports multiple active property roles without dropping entitlements", async () => {
    const client = clientWithPropertyRoles(["reception", "finance"]);
    await expect(
      requireStayNasModuleAccess(client, "user-3", "finance"),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the property-roles RPC cannot verify membership", async () => {
    const client = clientWithPropertyRoles([], new Error("rpc unavailable"));
    await expect(
      requireStayNasModuleAccess(client, "user-4", "finance"),
    ).rejects.toThrow("Unable to verify the active property's access role.");
  });
});


describe("property-scoped role guards", () => {
  it("allows only a role present in the selected active property", async () => {
    const client = clientWithPropertyRoles(["finance"]);
    await expect(requireStayNasPropertyRole(client, "user-5", ["owner", "finance"])).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("staynas_current_property_roles");
  });

  it("rejects roles held only outside the selected property", async () => {
    const client = clientWithPropertyRoles(["housekeeping"]);
    await expect(requireStayNasPropertyRole(client, "user-6", ["owner", "manager"])).rejects.toThrow("Forbidden");
  });

  it("allows operational staff roles in the selected property", async () => {
    const client = clientWithPropertyRoles(["reception"]);
    await expect(requireStayNasStaffAccess(client, "user-7")).resolves.toBeUndefined();
  });

  it("does not treat housekeeping as core staff for the legacy is_staff boundary", async () => {
    const client = clientWithPropertyRoles(["housekeeping"]);
    await expect(requireStayNasCoreStaffAccess(client, "user-8")).rejects.toThrow("Forbidden");
  });

  it("fails closed when role resolution errors", async () => {
    const client = clientWithPropertyRoles([], new Error("rpc unavailable"));
    await expect(requireStayNasPropertyRole(client, "user-9", ["owner"])).rejects.toThrow("Unable to verify the active property's access role.");
  });
});


describe("founder-admin authorization", () => {
  function founderClient(result: { data: unknown; error: unknown }) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result),
    };
    return { from: vi.fn().mockReturnValue(query) } as any;
  }

  it("allows a user present in the canonical platform-admin registry", async () => {
    const client = founderClient({ data: { user_id: "founder-1" }, error: null });
    await expect(requireStayNasFounderAdmin(client, "founder-1")).resolves.toBeUndefined();
    expect(client.from).toHaveBeenCalledWith("staynas_platform_admins");
  });

  it("rejects a property owner who is not a platform founder admin", async () => {
    const client = founderClient({ data: null, error: null });
    await expect(requireStayNasFounderAdmin(client, "property-owner")).rejects.toThrow("StayNas founder administration required.");
  });

  it("fails closed when the founder registry cannot be read", async () => {
    const client = founderClient({ data: null, error: new Error("database unavailable") });
    await expect(requireStayNasFounderAdmin(client, "founder-1")).rejects.toThrow("Unable to verify founder administration access.");
  });
});
