import { describe, expect, it, vi } from "vitest";
import { requireStayNasModuleAccess } from "./staynas-authorization.server";

function clientWithPropertyRole(role: string | null, error: unknown = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: role, error }),
  } as any;
}

describe("requireStayNasModuleAccess", () => {
  it("requires an authenticated user context", async () => {
    const client = clientWithPropertyRole("owner");
    await expect(
      requireStayNasModuleAccess(client, "", "finance"),
    ).rejects.toThrow("Forbidden");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("authorizes using the active property's owner membership", async () => {
    const client = clientWithPropertyRole("owner");
    await expect(
      requireStayNasModuleAccess(client, "user-1", "finance"),
    ).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("staynas_current_property_role");
  });

  it("does not use legacy global roles to authorize a property module", async () => {
    const client = clientWithPropertyRole(null);
    await expect(
      requireStayNasModuleAccess(client, "user-2", "reservations"),
    ).rejects.toThrow("Forbidden");
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("staynas_current_property_role");
  });

  it("denies roles without the requested module entitlement", async () => {
    const client = clientWithPropertyRole("reception");
    await expect(
      requireStayNasModuleAccess(client, "user-3", "finance"),
    ).rejects.toThrow("Forbidden");
  });

  it("fails closed when the property-role RPC cannot verify membership", async () => {
    const client = clientWithPropertyRole(null, new Error("rpc unavailable"));
    await expect(
      requireStayNasModuleAccess(client, "user-4", "finance"),
    ).rejects.toThrow("Unable to verify the active property's access role.");
  });
});
