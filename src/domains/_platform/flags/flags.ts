import type { FeatureFlag, FeatureFlagKey, FlagAudience } from "./types";

/**
 * Single source of truth for feature flags. Editable in code today; the
 * shape leaves room for a DB-backed override in a future sprint (add a
 * `resolveFlag()` that merges DB rows over these defaults).
 */
export const FEATURE_FLAGS: Record<FeatureFlagKey, FeatureFlag> = {
  guest_crm:            { key: "guest_crm",            state: "enabled",  description: "Guest CRM (Sprint 2)",                       since: "2026-07-13" },
  housekeeping:         { key: "housekeeping",         state: "disabled", description: "Housekeeping module" },
  finance:              { key: "finance",              state: "disabled", description: "Finance / invoicing / reports" },
  ai_assistant:         { key: "ai_assistant",         state: "internal", description: "In-app AI assistant" },
  loyalty:              { key: "loyalty",              state: "disabled", description: "Loyalty tiers & rewards" },
  marketing_automation: { key: "marketing_automation", state: "disabled", description: "Automated marketing campaigns" },
  multi_property:       { key: "multi_property",       state: "disabled", description: "Multi-property tenancy" },
  concierge:            { key: "concierge",            state: "disabled", description: "Concierge & itineraries" },
  maintenance:          { key: "maintenance",          state: "disabled", description: "Maintenance ticketing" },
  procurement:          { key: "procurement",          state: "disabled", description: "Procurement & suppliers" },
};

const STAFF_ROLES = new Set(["owner","manager","reception","marketing","housekeeping","finance","admin","reservations","editor"]);
const INTERNAL_ROLES = new Set(["owner","admin"]);

/** Pure resolver: does this audience see this flag? */
export function isFlagVisible(flag: FeatureFlag | undefined, audience: FlagAudience): boolean {
  if (!flag) return false;
  switch (flag.state) {
    case "enabled":  return true;
    case "disabled": return false;
    case "beta":     return audience.roles.some((r) => STAFF_ROLES.has(r));
    case "internal": return audience.roles.some((r) => INTERNAL_ROLES.has(r));
  }
}

export function getFlag(key: FeatureFlagKey): FeatureFlag {
  return FEATURE_FLAGS[key];
}

export function assertFlagEnabled(key: FeatureFlagKey, audience: FlagAudience): void {
  if (!isFlagVisible(FEATURE_FLAGS[key], audience)) {
    throw new Error(`Feature flag not enabled: ${key}`);
  }
}
