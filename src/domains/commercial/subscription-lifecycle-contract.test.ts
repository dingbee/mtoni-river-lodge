import { describe, expect, it } from "vitest";
import {
  commercialSubscriptionSchema,
  transitionCommercialSubscription,
  type CommercialSubscription,
} from "./subscription-lifecycle-contract";
import type { CommercialTrialPolicy } from "./trial-configuration-contract";

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

const base: CommercialSubscription = {
  id: "a9a2a51a-5c52-4b53-9c9b-3f4a3c3e9a10",
  commercialAccountId: "e2a3a3d1-7b72-4b58-bc32-29a7e8d0f001",
  planCode: "professional",
  planVersion: 1,
  priceSnapshot: {
    priceResolutionRef: "price-resolution-001",
    priceCode: "professional_tzs_monthly_v1",
    currency: "TZS",
    billingTerm: "monthly",
    propertyCount: 2,
    totalAmountMinor: 10000000,
    quoteRequired: false,
    lineItems: [{ kind: "plan_base", code: "professional_base", quantity: 1, unitAmountMinor: 10000000, amountMinor: 10000000 }],
  },
  addonCodes: [],
  status: "pending_activation",
  activatedAt: null,
  trialPolicyVersion: null,
  trialStartedAt: null,
  trialEndsAt: null,
  currentPeriodStartsAt: null,
  currentPeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  cancellationRequestedAt: null,
  suspendedAt: null,
  suspensionReasonCode: null,
  suspendedFromStatus: null,
  endedAt: null,
  createdAt: "2026-11-06T10:00:00.000Z",
  updatedAt: "2026-11-06T10:00:00.000Z",
};

describe("CC03.01 subscription lifecycle contracts", () => {
  it("validates the pending subscription snapshot", () => {
    expect(commercialSubscriptionSchema.parse(base)).toEqual(base);
  });

  it("starts an exact 14-day trial from activation, not account creation", () => {
    const result = transitionCommercialSubscription(base, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:00:00+03:00",
      policy,
    }).subscription;
    expect(result.status).toBe("trialing");
    expect(result.trialStartedAt).toBe("2026-11-06T07:00:00.000Z");
    expect(result.trialEndsAt).toBe("2026-11-20T07:00:00.000Z");
  });

  it("rejects a trial policy for another plan version", () => {
    expect(() => transitionCommercialSubscription(base, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:00:00Z",
      policy: { ...policy, planVersion: 2 },
    })).toThrow(/must match/);
  });

  it("does not allow a second trial activation", () => {
    const trialing = transitionCommercialSubscription(base, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:00:00Z",
      policy,
    }).subscription;
    expect(() => transitionCommercialSubscription(trialing, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:01:00Z",
      policy,
    })).toThrow(/Only pending/);
  });

  it("converts a trial to paid only through an explicit commercial acceptance reference", () => {
    const trialing = transitionCommercialSubscription(base, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:00:00Z",
      policy,
    }).subscription;
    const active = transitionCommercialSubscription(trialing, {
      type: "activate_paid",
      occurredAt: "2026-11-10T10:00:00Z",
      periodEndsAt: "2026-12-10T10:00:00Z",
      commercialAcceptanceRef: "accepted-offer-001",
    }).subscription;
    expect(active.status).toBe("active");
    expect(active.trialStartedAt).toBe(trialing.trialStartedAt);
    expect(active.currentPeriodEndsAt).toBe("2026-12-10T10:00:00Z");
  });

  it("rejects paid activation with an invalid period end", () => {
    expect(() => transitionCommercialSubscription(base, {
      type: "activate_paid",
      occurredAt: "2026-11-06T10:00:00Z",
      periodEndsAt: "2026-11-06T09:59:59Z",
      commercialAcceptanceRef: "accepted-offer-001",
    })).toThrow(/period end/);
  });

  it("suspends and reinstates without changing the billing snapshot", () => {
    const active = transitionCommercialSubscription(base, {
      type: "activate_paid",
      occurredAt: "2026-11-06T10:00:00Z",
      periodEndsAt: "2026-12-06T10:00:00Z",
      commercialAcceptanceRef: "accepted-offer-001",
    }).subscription;
    const suspended = transitionCommercialSubscription(active, {
      type: "suspend",
      occurredAt: "2026-11-10T10:00:00Z",
      reasonCode: "founder_review",
    }).subscription;
    expect(suspended.status).toBe("suspended");
    const reinstated = transitionCommercialSubscription(suspended, {
      type: "reinstate",
      occurredAt: "2026-11-11T10:00:00Z",
    }).subscription;
    expect(reinstated.status).toBe("active");
    expect(reinstated.priceSnapshot).toEqual(active.priceSnapshot);
  });

  it("expires instead of reinstating a subscription whose period elapsed while suspended", () => {
    const active = transitionCommercialSubscription(base, {
      type: "activate_paid",
      occurredAt: "2026-11-06T10:00:00Z",
      periodEndsAt: "2026-11-12T10:00:00Z",
      commercialAcceptanceRef: "accepted-offer-001",
    }).subscription;
    const suspended = transitionCommercialSubscription(active, {
      type: "suspend",
      occurredAt: "2026-11-07T10:00:00Z",
      reasonCode: "founder_review",
    }).subscription;
    const result = transitionCommercialSubscription(suspended, {
      type: "reinstate",
      occurredAt: "2026-11-13T10:00:00Z",
    }).subscription;
    expect(result.status).toBe("expired");
    expect(result.endedAt).toBe("2026-11-13T10:00:00Z");
  });

  it("schedules cancellation at period end without changing invoice or payment state", () => {
    const active = transitionCommercialSubscription(base, {
      type: "activate_paid",
      occurredAt: "2026-11-06T10:00:00Z",
      periodEndsAt: "2026-12-06T10:00:00Z",
      commercialAcceptanceRef: "accepted-offer-001",
    }).subscription;
    const scheduled = transitionCommercialSubscription(active, {
      type: "request_cancellation",
      occurredAt: "2026-11-20T10:00:00Z",
      atPeriodEnd: true,
    }).subscription;
    expect(scheduled.status).toBe("active");
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
  });

  it("cancels at the period boundary when cancellation was scheduled", () => {
    const active = transitionCommercialSubscription(base, {
      type: "activate_paid",
      occurredAt: "2026-11-06T10:00:00Z",
      periodEndsAt: "2026-12-06T10:00:00Z",
      commercialAcceptanceRef: "accepted-offer-001",
    }).subscription;
    const scheduled = transitionCommercialSubscription(active, {
      type: "request_cancellation",
      occurredAt: "2026-11-20T10:00:00Z",
      atPeriodEnd: true,
    }).subscription;
    const cancelled = transitionCommercialSubscription(scheduled, {
      type: "expire",
      occurredAt: "2026-12-06T10:00:00Z",
    }).subscription;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.endedAt).toBe("2026-12-06T10:00:00Z");
  });

  it("rejects expiration before the trial boundary", () => {
    const trialing = transitionCommercialSubscription(base, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:00:00Z",
      policy,
    }).subscription;
    expect(() => transitionCommercialSubscription(trialing, {
      type: "expire",
      occurredAt: "2026-11-20T09:59:59Z",
    })).toThrow(/not eligible/);
  });

  it("rejects terminal-state mutation", () => {
    const cancelled = transitionCommercialSubscription(base, {
      type: "cancel_immediately",
      occurredAt: "2026-11-07T10:00:00Z",
      reasonCode: "customer_request",
    }).subscription;
    expect(() => transitionCommercialSubscription(cancelled, {
      type: "cancel_immediately",
      occurredAt: "2026-11-08T10:00:00Z",
      reasonCode: "duplicate_request",
    })).toThrow(/Terminal/);
  });

  it("does not process invoice or payment state or grant entitlements", () => {
    const result = transitionCommercialSubscription(base, {
      type: "activate_trial",
      occurredAt: "2026-11-06T10:00:00Z",
      policy,
    }).subscription;
    expect(result).not.toHaveProperty("invoiceStatus");
    expect(result).not.toHaveProperty("paymentStatus");
    expect(result).not.toHaveProperty("entitlements");
  });
});
