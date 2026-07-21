import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "@/lib/activity-log.server";

/** Roles that may view the Staff module. */
const STAFF_VIEW_ROLES = ["owner", "manager", "admin"] as const;
/** Roles that may mutate role assignments. */
const ROLE_ADMIN_ROLES = ["owner", "admin"] as const;

export const APP_ROLES = [
  "owner",
  "manager",
  "reception",
  "marketing",
  "housekeeping",
  "finance",
  "editor",
  "admin",
  "reservations",
  "user",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertRoles(supabase: any, userId: string, roles: readonly string[]) {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: [...roles],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type StaffUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  roles: AppRole[];
};

/** List all users who have at least one role assignment, plus their roles. */
export const listStaffUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StaffUser[]> => {
    await assertRoles(context.supabase, context.userId, STAFF_VIEW_ROLES);

    const { data: assignments, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Group by user_id
    const byUser = new Map<string, { roles: AppRole[]; created_at: string | null }>();
    for (const row of assignments ?? []) {
      const existing = byUser.get(row.user_id) ?? { roles: [], created_at: row.created_at };
      if (!existing.roles.includes(row.role as AppRole)) existing.roles.push(row.role as AppRole);
      byUser.set(row.user_id, existing);
    }

    if (byUser.size === 0) return [];

    // Enrich with auth metadata via admin client (staff-only surface).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: StaffUser[] = [];
    for (const [uid, info] of byUser.entries()) {
      try {
        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(uid);
        const u = userRes?.user;
        results.push({
          user_id: uid,
          email: u?.email ?? null,
          full_name: (u?.user_metadata?.full_name as string) ?? (u?.user_metadata?.name as string) ?? null,
          last_sign_in_at: u?.last_sign_in_at ?? null,
          created_at: u?.created_at ?? info.created_at,
          roles: info.roles,
        });
      } catch {
        results.push({
          user_id: uid,
          email: null,
          full_name: null,
          last_sign_in_at: null,
          created_at: info.created_at,
          roles: info.roles,
        });
      }
    }
    results.sort((a, b) => (a.email ?? a.user_id).localeCompare(b.email ?? b.user_id));
    return results;
  });

/** Flat list of role assignments (for the Roles page). */
export const listRoleAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRoles(context.supabase, context.userId, STAFF_VIEW_ROLES);
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .order("role");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; user_id: string; role: AppRole; created_at: string }>;
  });

const roleMutSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(APP_ROLES),
});

/** Grant a role to a user. Owner/admin only. */
export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roleMutSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    const { error } = await context.supabase
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "role.assigned",
      entityType: "user_role",
      entityId: data.userId,
      entityLabel: data.role,
      newValue: { role: data.role },
    });
    return { ok: true };
  });

/** Revoke a role from a user. Owner/admin only. */
export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roleMutSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    // Guard: prevent removing the last owner.
    if (data.role === "owner") {
      const { count } = await context.supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) throw new Error("Cannot remove the last owner");
    }
    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "role.revoked",
      entityType: "user_role",
      entityId: data.userId,
      entityLabel: data.role,
      previousValue: { role: data.role },
    });
    return { ok: true };
  });