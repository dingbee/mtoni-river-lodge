import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_TRIAL_DURATION_DAYS,
  commercialTrialPolicySchema,
  createCommercialTrialWindow,
  type CommercialTrialPolicy,
} from "./trial-configuration-contract";

const policy: CommercialTrialPolicy = {
  planCode: "professional",
  planVersion: 1,
  policyVersion: 1,
  enabled: true,
  durationDays: 14,
  startTrigger: "subscription_activated",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

describe("CC02.04 commercial trial configuration", () => {
  it("locks the SCEF trial duration at 14 days", () => {
    expect(COMMERCIAL_TRIAL_DURATION_DAYS).toBe(14);
    expect(commercialTrialPolicySchema.safeParse(policy).success).toBe(true);
    expect(commercialTrialPolicySchema.safeParse({
      ...policy,
      durationDays: 30,
    }).success).toBe(false);
  });

  it("scopes policy to an exact plan and immutable plan version", () => {
    expect(commercialTrialPolicySchema.safeParse({
      ...policy,
      planVersion: 0,
    }).success).toBe(false);
    expect(commercialTrialPolicySchema.safeParse({
      ...policy,
      planCode: "starter",
    }).success).toBe(false);
  });

  it("starts the trial on subscription activation and calculates an exclusive 14-day end", () => {
    const window = createCommercialTrialWindow(policy, "2026-11-05T10:30:00+03:00");
    expect(window).toEqual({
      policyVersion: 1,
      planCode: "professional",
      planVersion: 1,
      durationDays: 14,
      startedAt: "2026-11-05T07:30:00.000Z",
      endsAt: "2026-11-19T07:30:00.000Z",
      endBoundary: "exclusive",
    });
  });

  it("rejects a disabled policy", () => {
    expect(() => createCommercialTrialWindow({
      ...policy,
      enabled: false,
    }, "2026-11-05T10:30:00Z")).toThrow(/disabled/);
  });

  it("rejects invalid activation timestamps", () => {
    expect(() => createCommercialTrialWindow(policy, "not-a-date")).toThrow(/ISO-8601/);
  });

  it("rejects an inverted policy effective date window", () => {
    expect(commercialTrialPolicySchema.safeParse({
      ...policy,
      effectiveFrom: "2026-12-01",
      effectiveTo: "2026-01-01",
    }).success).toBe(false);
  });

  it("does not assume automatic billing conversion or mutate subscription state", () => {
    expect(Object.keys(createCommercialTrialWindow(policy, "2026-11-05T00:00:00Z"))).toEqual([
      "policyVersion",
      "planCode",
      "planVersion",
      "durationDays",
      "startedAt",
      "endsAt",
      "endBoundary",
    ]);
  });
});
