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
  | "procurement";

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
