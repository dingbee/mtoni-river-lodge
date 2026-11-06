/**
 * Server-side guards for the Intelligence Core.
 * Server-only (filename is import-protected). Uses the existing role RPCs.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
import { INTEL_DECIDE_ROLES, INTEL_READ_ROLES } from "./permissions";

type Sb = any;

export async function rolesFor(supabase: Sb, userId: string): Promise<string[]> {
  // userId remains part of the authorization contract; the RPC derives roles
  // from the authenticated caller, avoiding a direct user_roles SELECT that
  // is intentionally blocked by RLS.
  void userId;

  const { data, error } = await supabase.rpc("staynas_current_property_roles");
  if (error) throw new Error(error.message);

  return (data ?? []).map((role: any) => String(role));
}

export async function assertIntelRead(supabase: Sb, userId: string) {
  const roles = await rolesFor(supabase, userId);
  if (!roles.some((role) => (INTEL_READ_ROLES as readonly string[]).includes(role))) {
    throw new Error("Forbidden — Intelligence Core requires an active property staff role.");
  }
}

export async function assertIntelDecide(supabase: Sb, userId: string) {
  const roles = await rolesFor(supabase, userId);
  if (!roles.some((role) => (INTEL_DECIDE_ROLES as readonly string[]).includes(role))) {
    throw new Error("Forbidden — this decision requires a property manager or owner role.");
  }
}

/** Narrow a query to modules the caller's roles may see. */
export async function visibleModules(supabase: Sb, userId: string): Promise<string[]> {
  const { allowedModulesForRoles } = await import("./permissions");
  return allowedModulesForRoles(await rolesFor(supabase, userId));
}
