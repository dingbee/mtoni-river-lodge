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
  operations_centre:    { key: "operations_centre",    state: "enabled",  description: "Operations Centre (Sprint 4)", since: "2026-07-13" },
  cms_pages:            { key: "cms_pages",            state: "beta",     description: "CMS pages workflow (Sprint 5)",       since: "2026-07-15" },
  page_builder:         { key: "page_builder",         state: "beta",     description: "Block-based page builder (Sprint 5)", since: "2026-07-15" },
  seo_centre:           { key: "seo_centre",           state: "beta",     description: "Per-route SEO overrides (Sprint 5)",   since: "2026-07-15" },
  ai_seo_assistant:     { key: "ai_seo_assistant",     state: "beta",     description: "AI SEO / content suggestions",         since: "2026-07-15" },
  media_library_v2:     { key: "media_library_v2",     state: "beta",     description: "Media Library 2.0",                    since: "2026-07-15" },
  brand_centre:         { key: "brand_centre",         state: "beta",     description: "Brand tokens & guidelines",            since: "2026-07-15" },
  content_calendar:     { key: "content_calendar",     state: "beta",     description: "Unified content calendar",             since: "2026-07-15" },
  reviews_centre_v2:    { key: "reviews_centre_v2",    state: "beta",     description: "Reviews & Reputation Centre",          since: "2026-07-15" },
  website_analytics:    { key: "website_analytics",    state: "beta",     description: "Website analytics framework",          since: "2026-07-15" },
  mtoni_ai_command_centre: { key: "mtoni_ai_command_centre", state: "internal", description: "Mtoni AI Command Centre (Sprint 8A)", since: "2026-07-17" },
  mtoni_ai_concierge:      { key: "mtoni_ai_concierge",      state: "enabled",  description: "Public AI Concierge widget (Sprint 9)", since: "2026-07-17" },
};

const STAFF_ROLES = new Set(["owner","manager","reception","marketing","housekeeping","finance","reservations","editor"]);
const INTERNAL_ROLES = new Set(["owner"]);

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
