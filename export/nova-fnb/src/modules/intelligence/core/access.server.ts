/**
 * Server-side guards for the Intelligence Core.
 * Server-only (filename is import-protected). Uses the existing role RPCs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
import { INTEL_DECIDE_ROLES, INTEL_READ_ROLES } from "./permissions";

type Sb = any;

export async function rolesFor(supabase: Sb, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => String(r.role));
}

export async function assertIntelRead(supabase: Sb, userId: string) {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: INTEL_READ_ROLES as unknown as string[],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — Intelligence Core requires a staff role.");
}

export async function assertIntelDecide(supabase: Sb, userId: string) {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: INTEL_DECIDE_ROLES as unknown as string[],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — this decision requires a manager or owner role.");
}

/** Narrow a query to modules the caller's roles may see. */
export async function visibleModules(supabase: Sb, userId: string): Promise<string[]> {
  const { allowedModulesForRoles } = await import("./permissions");
  return allowedModulesForRoles(await rolesFor(supabase, userId));
}