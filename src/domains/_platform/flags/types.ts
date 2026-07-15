/** Feature flag key catalogue. Adding a new flag: extend this union and add
 *  its definition in `flags.ts`. */
export type FeatureFlagKey =
  | "guest_crm"
  | "housekeeping"
  | "finance"
  | "ai_assistant"
  | "loyalty"
  | "marketing_automation"
  | "multi_property"
  | "concierge"
  | "maintenance"
  | "procurement"
  | "operations_centre"
  | "cms_pages"
  | "page_builder"
  | "seo_centre"
  | "ai_seo_assistant"
  | "media_library_v2"
  | "brand_centre"
  | "content_calendar"
  | "reviews_centre_v2"
  | "website_analytics";

export type FlagState = "enabled" | "disabled" | "beta" | "internal";

export interface FeatureFlag {
  key: FeatureFlagKey;
  state: FlagState;
  description: string;
  /** ISO date. Purely informational. */
  since?: string;
}

export interface FlagAudience {
  /** Current user's roles. Empty array = unauthenticated. */
  roles: readonly string[];
}
