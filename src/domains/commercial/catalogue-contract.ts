import { z } from "zod";

/**
 * CC-02 commercial catalogue contracts.
 *
 * This domain describes purchasable platform products. It is deliberately
 * separate from property room/rate pricing, subscriptions, invoices, payments,
 * and runtime entitlements.
 */

export const COMMERCIAL_PLAN_CODES = ["essential", "professional", "enterprise"] as const;
export type CommercialPlanCode = (typeof COMMERCIAL_PLAN_CODES)[number];

export const COMMERCIAL_PLAN_STATUSES = ["draft", "published", "retired"] as const;
export type CommercialPlanStatus = (typeof COMMERCIAL_PLAN_STATUSES)[number];

export const COMMERCIAL_VERSION_STATUSES = ["draft", "published", "retired"] as const;
export type CommercialVersionStatus = (typeof COMMERCIAL_VERSION_STATUSES)[number];

export const COMMERCIAL_CURRENCIES = ["TZS", "USD"] as const;
export type CommercialCurrency = (typeof COMMERCIAL_CURRENCIES)[number];

export const COMMERCIAL_BILLING_TERMS = ["monthly", "annual"] as const;
export type CommercialBillingTerm = (typeof COMMERCIAL_BILLING_TERMS)[number];

/**
 * Capability groups are intentionally coarser than navigation entries.
 * operationalModuleRefs connect a commercial capability to existing app
 * registry identifiers without making every screen independently sellable.
 */
export const COMMERCIAL_MODULE_CODES = [
  "reservations",
  "rooms",
  "front_desk",
  "operations",
  "housekeeping",
  "guests",
  "finance",
  "revenue",
  "automation",
  "concierge",
  "content",
  "marketing",
  "¶»§q«^