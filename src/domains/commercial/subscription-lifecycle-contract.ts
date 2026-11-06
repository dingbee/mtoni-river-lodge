import { z } from "zod";
import {
  COMMERCIAL_BILLING_TERMS,
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_PLAN_CODES,
} from "./catalogue-contract";
import {
  commercialTrialPolicySchema,
  createCommercialTrialWindow,
  type CommercialTrialPolicy,
} from "./trial-configuration-contract";

/**
 * CC-03.01 subscription lifecycle contracts.
 *
 * These are pure domain contracts and deterministic transitions. They do not
 * persist records, issue invoices, process payments, or grant runtime access.
 */
export const COMMERCIAL_SUBSCRIPTION_STATUSES = [
  "pending_activation",
  "trialing",
  "active",
  "suspended",
  "cancelled",
  "expired",
] as const;
export type CommercialSubscriptionStatus =
  (typeof COMMERCIAL_SUBSCRIPTION_STATUSES)[number];

const timestamp = z.string().datetime({ offset: true });
const reference = z.string().trim().min(1).max(300);
const amountMinor = z.number().int().safe().nonnegative();

export const commercialSubscriptionPriceSnapshotSchema = z.object({
  priceResolutionRef: reference,
  priceCode: reference,
  currency: z.enum(COMMERCIAL_CURRENCIES),
  billingTerm: z.enum(COMMERCIAL_BILLING_TERMS),
  propertyCount: z.number().int().positive(),
  totalAmountMinor: amountMinor.nullable(),
  quoteRequired: z.boolean(),
  lineItems: z.array(z.object({
    kind: z.enum(["plan_base", "additional_property", "addon"]),
    code: reference,
    quantity: z.number().int().positive(),
    unitAmountMinor: amountMinor,
    amountMinor,
  })),
}).superRefine((value, ctx) => {
  if (value.quoteRequired && value.totalAmountMinor !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalAmountMinor"],
      message: "Quote-required subscriptions cannot carry a fabricated total",
    });
  }
  if (!value.quoteRequired && value.totalAmountMinor === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["totalAmountMinor"],
      message: "Fixed-price subscriptions require a resolved total",
    });
  }
});
export type CommercialSubscriptionPriceSnapshot =
  z.infer<typeof commercialSubscriptionPriceSnapshotSchema>;

export const commercialSubscriptionSchema = z.object({
  id: z.string().uuid(),
  commercialAccountId: z.string().uuid(),
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  priceSnapshot: commercialSubscriptionPriceSnapshotSchema,
  addonCodes: z.array(reference),
  status: z.enum(COMMERCIAL_SUBSCRIPTION_STATUSES),
  activatedAt: timestamp.nullable(),
  trialPolicyVersion: z.number().int().positive().nullable(),
  trialStartedAt: timestamp.nullable(),
  trialEndsAt: timestamp.nullable(),
  currentPeriodStartsAt: timestamp.nullable(),
  currentPeriodEndsAt: timestamp.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  cancellationRequestedAt: timestamp.nullable(),
  suspendedAt: timestamp.nullable(),
  suspensionReasonCode: z.string().trim().min(1).max(120).nullable(),
  suspendedFromStatus: z.enum(["trialing", "active"]).nullable(),
  endedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((value, ctx) => {
  if (value.priceSnapshot.currency === "USD" || value.priceSnapshot.currency === "TZS") {
    // Currency is intentionally repeated in the accepted snapshot; no conversion is performed.
  }
  if (value.priceSnapshot.quoteRequired && value.planCode !== "enterprise") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["priceSnapshot", "quoteRequired"],
      message: "Quote-required subscriptions are reserved for Enterprise",
    });
  }
  if (value.priceSnapshot.billingTerm !== value.priceSnapshot.billingTerm) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceSnapshot", "billingTerm"], message: "Invalid billing term" });
  }
  if (value.status === "pending_activation" && value.activatedAt !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activatedAt"], message: "Pending subscriptions cannot have an activation timestamp" });
  }
  if (value.status !== "pending_activation" && value.activatedAt === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["activatedAt"], message: "Activated subscriptions require an activation timestamp" });
  }
  if (value.status === "trialing" && (!value.trialStartedAt || !value.trialEndsAt || !value.trialPolicyVersion)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trialEndsAt"], message: "Trialing subscriptions require a complete trial window and policy version" });
  }
  if (value.trialStartedAt && value.trialEndsAt && Date.parse(value.trialEndsAt) <= Date.parse(value.trialStartedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trialEndsAt"], message: "Trial end must be after trial start" });
  }
  if (value.status === "active" && (!value.currentPeriodStartsAt || !value.currentPeriodEndsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currentPeriodEndsAt"], message: "Active subscriptions require a current billing period" });
  }
  if (value.currentPeriodStartsAt && value.currentPeriodEndsAt && Date.parse(value.currentPeriodEndsAt) <= Date.parse(value.currentPeriodStartsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currentPeriodEndsAt"], message: "Billing period end must be after its start" });
  }
  if (value.status === "suspended" && (!value.suspendedAt || !value.suspensionReasonCode || !value.suspendedFromStatus)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suspendedAt"], message: "Suspended subscriptions require suspension evidence and a prior status" });
  }
  if (value.status !== "suspended" && (value.suspendedAt !== null || value.suspensionReasonCode !== null || value.suspendedFromStatus !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["suspendedAt"], message: "Suspension fields are only valid while suspended" });
  }
  if (["cancelled", "expired"].includes(value.status) && value.endedAt === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endedAt"], message: "Terminal subscriptions require an end timestamp" });
  }
  if (!["cancelled", "expired"].includes(value.status) && value.endedAt !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endedAt"], message: "Non-terminal subscriptions cannot have an end timestamp" });
  }
  if (value.cancelAtPeriodEnd && (!value.cancellationRequestedAt || !value.currentPeriodEndsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cancelAtPeriodEnd"], message: "Scheduled cancellation requires a request timestamp and current period end" });
  }
});
export type CommercialSubscription = z.infer<typeof commercialSubscriptionSchema>;

export const commercialAccountSchema = z.object({
  id: z.string().uuid(),
  organisationId: z.string().uuid(),
  status: z.enum(["active", "closed"]),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type CommercialAccount = z.infer<typeof commercialAccountSchema>;

export const commercialSubscriptionActivationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("activate_trial"),
    occurredAt: timestamp,
    policy: commercialTrialPolicySchema,
  }),
  z.object({
    type: z.literal("activate_paid"),
    occurredAt: timestamp,
    periodEndsAt: timestamp,
    commercialAcceptanceRef: reference,
  }),
]);
export type CommercialSubscriptionActivationEvent =
  z.infer<typeof commercialSubscriptionActivationEventSchema>;

export const commercialSubscriptionLifecycleEventSchema = z.discriminatedUnion("type", [
  commercialSubscriptionActivationEventSchema.options[0],
  commercialSubscriptionActivationEventSchema.options[1],
  z.object({
    type: z.literal("suspend"),
    occurredAt: timestamp,
    reasonCode: z.string().trim().min(1).max(120),
  }),
  z.object({
    type: z.literal("reinstate"),
    occurredAt: timestamp,
  }),
  z.object({
    type: z.literal("request_cancellation"),
    occurredAt: timestamp,
    atPeriodEnd: z.boolean(),
  }),
  z.object({
    type: z.literal("expire"),
    occurredAt: timestamp,
  }),
  z.object({
    type: z.literal("cancel_immediately"),
    occurredAt: timestamp,
    reasonCode: z.string().trim().min(1).max(120),
  }),
]);
export type CommercialSubscriptionLifecycleEvent =
  z.infer<typeof commercialSubscriptionLifecycleEventSchema>;

export interface SubscriptionTransitionResult {
  subscription: CommercialSubscription;
  eventType: CommercialSubscriptionLifecycleEvent["type"];
}

/**
 * Apply one validated lifecycle event. The caller must first authenticate,
 * resolve the commercial account and authorize the command server-side.
 * Persistence and append-only event recording are separate CC03 milestones.
 */
export function transitionCommercialSubscription(
  rawSubscription: CommercialSubscription,
  rawEvent: CommercialSubscriptionLifecycleEvent,
): SubscriptionTransitionResult {
  const subscription = commercialSubscriptionSchema.parse(rawSubscription);
  const event = commercialSubscriptionLifecycleEventSchema.parse(rawEvent);
  const occurredAt = Date.parse(event.occurredAt);
  const current: CommercialSubscription = { ...subscription, updatedAt: event.occurredAt };

  switch (event.type) {
    case "activate_trial": {
      if (subscription.status !== "pending_activation") throw new Error("Only pending subscriptions can start a trial");
      if (event.policy.planCode !== subscription.planCode || event.policy.planVersion !== subscription.planVersion) {
        throw new Error("Trial policy must match the subscription plan and version");
      }
      const window = createCommercialTrialWindow(event.policy, event.occurredAt);
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: "trialing",
          activatedAt: event.occurredAt,
          trialPolicyVersion: window.policyVersion,
          trialStartedAt: window.startedAt,
          trialEndsAt: window.endsAt,
        }),
        eventType: event.type,
      };
    }
    case "activate_paid": {
      if (!["pending_activation", "trialing"].includes(subscription.status)) {
        throw new Error("Only pending or trialing subscriptions can activate as paid");
      }
      if (subscription.priceSnapshot.quoteRequired && subscription.planCode !== "enterprise") {
        throw new Error("Quote-required pricing is only valid for Enterprise");
      }
      if (Date.parse(event.periodEndsAt) <= occurredAt) throw new Error("Paid subscription period end must be after activation");
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: "active",
          activatedAt: subscription.activatedAt ?? event.occurredAt,
          currentPeriodStartsAt: event.occurredAt,
          currentPeriodEndsAt: event.periodEndsAt,
          cancelAtPeriodEnd: false,
          cancellationRequestedAt: null,
          suspendedAt: null,
          suspensionReasonCode: null,
          suspendedFromStatus: null,
          endedAt: null,
        }),
        eventType: event.type,
      };
    }
    case "suspend": {
      if (!["trialing", "active"].includes(subscription.status)) throw new Error("Only trialing or active subscriptions can be suspended");
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: "suspended",
          suspendedAt: event.occurredAt,
          suspensionReasonCode: event.reasonCode,
          suspendedFromStatus: subscription.status,
        }),
        eventType: event.type,
      };
    }
    case "reinstate": {
      if (subscription.status !== "suspended" || !subscription.suspendedFromStatus) throw new Error("Only suspended subscriptions can be reinstated");
      const resumeStatus = subscription.suspendedFromStatus;
      const validUntil = resumeStatus === "trialing" ? subscription.trialEndsAt : subscription.currentPeriodEndsAt;
      if (!validUntil || Date.parse(validUntil) <= occurredAt) {
        return {
          subscription: commercialSubscriptionSchema.parse({
            ...current,
            status: "expired",
            suspendedAt: null,
            suspensionReasonCode: null,
            suspendedFromStatus: null,
            endedAt: event.occurredAt,
          }),
          eventType: event.type,
        };
      }
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: resumeStatus,
          suspendedAt: null,
          suspensionReasonCode: null,
          suspendedFromStatus: null,
        }),
        eventType: event.type,
      };
    }
    case "request_cancellation": {
      if (!["trialing", "active", "suspended"].includes(subscription.status)) throw new Error("Subscription cannot be cancelled from its current state");
      if (event.atPeriodEnd) {
        if (!subscription.currentPeriodEndsAt) throw new Error("Scheduled cancellation requires an active paid period");
        return {
          subscription: commercialSubscriptionSchema.parse({
            ...current,
            cancelAtPeriodEnd: true,
            cancellationRequestedAt: event.occurredAt,
          }),
          eventType: event.type,
        };
      }
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: "cancelled",
          cancelAtPeriodEnd: false,
          cancellationRequestedAt: event.occurredAt,
          suspendedAt: null,
          suspensionReasonCode: null,
          suspendedFromStatus: null,
          endedAt: event.occurredAt,
        }),
        eventType: event.type,
      };
    }
    case "expire": {
      const expiry = subscription.status === "trialing"
        ? subscription.trialEndsAt
        : subscription.currentPeriodEndsAt;
      if (!["trialing", "active"].includes(subscription.status) || !expiry || occurredAt < Date.parse(expiry)) {
        throw new Error("Subscription is not eligible to expire at the supplied time");
      }
      const terminalStatus = subscription.cancelAtPeriodEnd ? "cancelled" : "expired";
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: terminalStatus,
          cancelAtPeriodEnd: false,
          endedAt: event.occurredAt,
        }),
        eventType: event.type,
      };
    }
    case "cancel_immediately": {
      if (["cancelled", "expired"].includes(subscription.status)) throw new Error("Terminal subscriptions cannot be cancelled again");
      return {
        subscription: commercialSubscriptionSchema.parse({
          ...current,
          status: "cancelled",
          cancelAtPeriodEnd: false,
          cancellationRequestedAt: event.occurredAt,
          suspendedAt: null,
          suspensionReasonCode: null,
          suspendedFromStatus: null,
          endedAt: event.occurredAt,
        }),
        eventType: event.type,
      };
    }
  }
}
