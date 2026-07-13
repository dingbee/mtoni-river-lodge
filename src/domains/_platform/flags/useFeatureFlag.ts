import { useCurrentUserRoles } from "@/lib/permissions";
import { FEATURE_FLAGS, isFlagVisible } from "./flags";
import type { FeatureFlagKey } from "./types";

/** React hook: is a flag currently visible to the signed-in user? */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { data: roles } = useCurrentUserRoles();
  return isFlagVisible(FEATURE_FLAGS[key], { roles: roles ?? [] });
}
