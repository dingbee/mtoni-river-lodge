import { describe, expect, it } from "vitest";
import { actionIdempotencyKey, isHousekeepingOnline } from "./housekeeping-offline";

describe("housekeeping resilience helpers", () => {
  it("generates unique retry keys for the same action and task", () => {
    const a = actionIdempotencyKey("claim", "00000000-0000-0000-0000-000000000001");
    const b = actionIdempotencyKey("claim", "00000000-0000-0000-0000-000000000001");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^hk:claim:/);
    expect(b).toMatch(/^hk:claim:/);
  });

  it("treats non-browser test execution as online", () => {
    expect(isHousekeepingOnline()).toBe(true);
  });
});
