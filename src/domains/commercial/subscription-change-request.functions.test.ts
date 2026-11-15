import { describe, expect, it } from "vitest";
import {
  founderSubscriptionDecisionInputSchema,
  subscriptionChangeRequestInputSchema,
} from "./subscription-change-request.functions";

const base = {
  reason: "Our property is expanding and needs additional campaign tools.",
  idempotencyKey: "cps07-test-key-0001",
};

describe("CPS-07 tenant subscription change request contract", () => {
  it("requires complete plan, billing and property terms for new subscriptions", () => {
    expect(
      subscriptionChangeRequestInputSchema.safeParse({
        ...base,
        requestType: "subscribe",
        planCode: "professional",
        planVersion: 1,
        currency: "TZS",
        billingTerm: "annual",
        propertyCount: 2,
        addonCodes: [],
      }).success,
    ).toBe(true);
    expect(
      subscriptionChangeRequestInputSchema.safeParse({ ...base, requestType: "subscribe" }).success,
    ).toBe(false);
  });

  it("requires an existing subscription and selected published add-ons for add/remove requests", () => {
    expect(
      subscriptionChangeRequestInputSchema.safeParse({
        ...base,
        requestType: "add_addon",
        subscriptionId: "a54b4a31-27e4-4b0c-9b15-2a2fb56d24ad",
        addonCodes: ["campaign_studio"],
      }).success,
    ).toBe(true);
    expect(
      subscriptionChangeRequestInputSchema.safeParse({
        ...base,
        requestType: "add_addon",
        addonCodes: ["campaign_studio"],
      }).success,
    ).toBe(false)¶»§q«^