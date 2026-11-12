import { describe, expect, it } from "vitest";
import { hasStayNasEntitlement, normalizeStayNasRoles } from "./staynas-entitlements";

describe("direct booking analytics module entitlement", () => {
  it.each(["owner", "manager", "finance", "marketing"])(
    "grants the analytics capability to %s",
    (role) => {
      expect(hasStayNasEntitlement("direct-booking.analytics", [role])).toBe(true);
    },
  );

  it.each(["reception", "housekeeping", "editor", "unknown"])(
    "does not grant the analytics capability to %s",
    (role) => {
      expect(hasStayNasEntitlement("direct-booking.analytics", [role])).toBe(false);
    },
  );

  it("preserves legacy admin-to-owner compatibility", () => {
    expect(normalizeStayNasRoles(["admin"])).toEqual(["owner"]);
    expect(hasStayNasEntitlement("direct-booking.analytics", ["admin"])).toBe(true);
  });
});
