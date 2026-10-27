import { describe, expect, it } from "vitest";

type Member = { userId: string; propertyId: string; role: string; active: boolean };
export function mayManagePropertyIntegration(member: Member | null, userId: string, propertyId: string) {
  return Boolean(member && member.userId === userId && member.propertyId === propertyId && member.active && ["owner", "manager", "admin"].includes(member.role));
}
export function mayViewFounderIntegrationHealth(roles: string[]) {
  return roles.some((role) => ["admin", "founder_admin", "super_admin"].includes(role));
}
export function redactIntegration(row: Record<string, unknown>) {
  const { credential_reference: _reference, consumer_key: _key, consumer_secret: _secret, api_key: _apiKey, ...safe } = row;
  return safe;
}

describe("payment integration authorization boundaries", () => {
  const tenantA = { userId: "user-a", propertyId: "property-a", role: "owner", active: true };
  it("allows a property owner to manage their own integration", () => {
    expect(mayManagePropertyIntegration(tenantA, "user-a", "property-a")).toBe(true);
  });
  it("rejects tenant A reading or changing tenant B integration", () => {
    expect(mayManagePropertyIntegration(tenantA, "user-a", "property-b")).toBe(false);
  });
  it("rejects users who are not active owner/manager/admin members", () => {
    expect(mayManagePropertyIntegration({ ...tenantA, role: "finance" }, "user-a", "property-a")).toBe(false);
    expect(mayManagePropertyIntegration({ ...tenantA, active: false }, "user-a", "property-a")).toBe(false);
  });
  it("does not treat property owner role as Founder Admin", () => {
    expect(mayViewFounderIntegrationHealth(["owner"])).toBe(false);
    expect(mayViewFounderIntegrationHealth(["admin"])).toBe(true);
    expect(mayViewFounderIntegrationHealth(["founder_admin"])).toBe(true);
  });
  it("removes credential references and common secret fields from view models", () => {
    const safe = redactIntegration({ id: "i", credential_reference: "vault://secret-id", consumer_key: "private", consumer_secret: "private", api_key: "private", enabled: true });
    expect(safe).toEqual({ id: "i", enabled: true });
    expect(JSON.stringify(safe)).not.toMatch(/private|vault:\/\//);
  });
});
