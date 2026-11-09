import {
  COMMERCIAL_MODULE_CODES,
  COMMERCIAL_PLAN_CODES,
  type CommercialModule,
  type CommercialPlan,
} from "./catalogue-contract";

/**
 * Canonical plan identities from SCEF Baseline v1.0.
 * Prices and plan-module inclusion are intentionally not assigned here.
 * Those require their own approved commercial configuration.
 */
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = [
  {
    code: "essential",
    name: "Essential",
    description: "StayNas Essential subscription tier.",
    status: "draft",
  },
  {
    code: "professional",
    name: "Professional",
    description: "StayNas Professional subscription tier.",
    status: "draft",
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "StayNas Enterprise subscription tier, including negotiated agreements.",
    status: "draft",
  },
] as const;

/**
 * Capability-level commercial catalogue.
 *
 * These are broad product capabilities, not one-to-one copies of navigation
 * items. Operational registry mappings are intentionally left empty until
 * each capability-to-runtime mapping is verified and approved.
 */
const moduleNames: Record<(typeof COMMERCIAL_MODULE_CODES)[number], string> = {
  reservations: "Reservations",
  rooms: "Rooms",
  front_desk: "Front Desk",
  operations: "Operations",
  housekeeping: "Housekeeping",
  guests: "Guest Management",
  finance: "Finance",
  revenue: "Revenue Management",
  automation: "Automation",
  concierge: "Guest Concierge",
  content: "Content Management",
  marketing: "Marketing",
  integrations: "Integrations",
  intelligence: "StayNas Intelligence",
  direct_booking_pages: "Direct Booking Pages",
  campaign_studio: "Campaign Studio",
  campaign_analytics_advanced: "Advanced Campaign Analytics",
};

export const COMMERCIAL_MODULES: readonly CommercialModule[] = COMMERCIAL_MODULE_CODES.map((code) => ({
  code,
  name: moduleNames[code],
  description: `${moduleNames[code]} commercial capability.`,
  status: "draft",
  operationalModuleRefs: [],
}));

export function getCommercialPlan(code: (typeof COMMERCIAL_PLAN_CODES)[number]) {
  return COMMERCIAL_PLANS.find((plan) => plan.code === code);
}

export function getCommercialModule(code: (typeof COMMERCIAL_MODULE_CODES)[number]) {
  return COMMERCIAL_MODULES.find((module) => module.code === code);
}
