/**
 * Intelligence Core — access rules.
 * Reuses the existing NOVA F&B OS role model (`has_any_role`); no new role store.
 */
import type { IntelModule } from "./contracts";

/** Anyone who may read intelligence output at all. */
export const INTEL_READ_ROLES = [
  "owner",
  "admin",
  "manager",
  "reception",
  "reservations",
  "finance",
  "marketing",
  "housekeeping",
] as const;

/** Roles allowed to accept/dismiss, approve actions and curate memory. */
export const INTEL_DECIDE_ROLES = ["owner", "admin", "manager"] as const;

/** Role → intelligence modules visible to that role. */
const ROLE_MODULES: Record<string, readonly IntelModule[]> = {
  owner: ["pms", "booking", "guest", "revenue", "marketing", "restaurant", "operations", "finance", "content", "platform"],
  admin: ["pms", "booking", "guest", "revenue", "marketing", "restaurant", "operations", "finance", "content", "platform"],
  manager: ["pms", "booking", "guest", "revenue", "marketing", "restaurant", "operations", "finance", "content"],
  reception: ["pms", "booking", "guest", "operations"],
  reservations: ["pms", "booking", "guest", "operations"],
  finance: ["finance", "revenue", "booking"],
  marketing: ["marketing", "content", "guest"],
  housekeeping: ["operations", "pms"],
  editor: ["content", "marketing"],
};

export function allowedModulesForRoles(roles: readonly string[]): IntelModule[] {
  const set = new Set<IntelModule>();
  for (const r of roles) for (const m of ROLE_MODULES[r] ?? []) set.add(m);
  return Array.from(set);
}

export function canSeeModule(roles: readonly string[], module: IntelModule): boolean {
  return allowedModulesForRoles(roles).includes(module);
}