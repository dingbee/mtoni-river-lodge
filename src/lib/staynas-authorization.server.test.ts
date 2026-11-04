import { describe, expect, it, vi } from "vitest";
import { requireStayNasModuleAccess } from "./staynas-authorization.server";

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
