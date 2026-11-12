import { describe, expect, it } from "vitest";
import { redactAnalyticsPath } from "./analytics";

describe("analytics credential redaction", () => {
  it("never emits a guest bearer token as an analytics path", () => {
    expect(redactAnalyticsPath("/guest/very-secret-bearer-token")).toBe("/guest/[credential]");
  });

  it("preserves ordinary non-credential routes", () => {
    expect(redactAnalyticsPath("/rooms")).toBe("/rooms");
    expect(redactAnalyticsPath("/admin/operations/reservations")).toBe("/admin/operations/reservations");
  });
});
