import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "@/lib/activity-log.server";

/** Roles that may view the Staff module. */
const STAFF_VIEW_ROLES = ["owner", "manager", "admin"] as const;
/** Roles that may mutate role assignments or invite users. */
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
  department: string | null;
  notes: string | null;
  status: "pending" | "active" | "disabled";
  last_sign_in_at: string | null;
  created_at: string | null;
  roles: AppRole[];
};

function deriveStatus(u: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  invited_at?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
}): "pending" | "active" | "disabled" {
  const banned = u.banned_until && new Date(u.banned_until).getTime() > Date.now();
  if (banned) return "disabled";
  const confirmed = !!(u.email_confirmed_at || u.confirmed_at);
  if (!confirmed && !u.last_sign_in_at) return "pending";
  return "active";
}

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
        const u = userRes?.user as any;
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        results.push({
          user_id: uid,
          email: u?.email ?? null,
          full_name:
            (meta.full_name as string) ??
            (meta.name as string) ??
            null,
          department: (meta.department as string) ?? null,
          notes: (meta.notes as string) ?? null,
          status: u ? deriveStatus(u) : "active",
          last_sign_in_at: u?.last_sign_in_at ?? null,
          created_at: u?.created_at ?? info.created_at,
          roles: info.roles,
        });
      } catch {
        results.push({
          user_id: uid,
          email: null,
          full_name: null,
          department: null,
          notes: null,
          status: "active",
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

/* ------------------------------------------------------------------ */
/*  Invite / lifecycle actions (owner + admin only)                    */
/* ------------------------------------------------------------------ */

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, "Full name required").max(120),
  email: z.string().trim().toLowerCase().email("Valid email required").max(255),
  role: z.enum(APP_ROLES),
  department: z.string().trim().max(80).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Invite a new staff member.
 * - Sends a Supabase invite email (or reuses an existing user if already present)
 * - Stores full_name / department / notes in user_metadata
 * - Assigns the selected role
 */
export const inviteStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const metadata = {
      full_name: data.fullName,
      department: data.department || null,
      notes: data.notes || null,
      invited_by: context.userId,
    };

    let userId: string | null = null;
    let emailSent = false;

    // Try to invite (sends the email). If the user already exists, fall back
    // to updating metadata + generating a fresh invite link.
    const invite = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: metadata,
    });
    if (invite.data?.user) {
      userId = invite.data.user.id;
      emailSent = true;
    } else if (invite.error) {
      // Find existing user by email
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = await (supabaseAdmin.auth.admin as any).listUsers({ page: 1, perPage: 200 });
      const existing = list.data?.users?.find(
        (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === data.email,
      );
      if (!existing) throw new Error(invite.error.message);
      userId = existing.id;
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { user_metadata: metadata });
    }

    if (!userId) throw new Error("Failed to resolve invited user");

    // Assign the role (idempotent).
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleErr && !/duplicate/i.test(roleErr.message)) throw new Error(roleErr.message);

    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "staff.invited",
      entityType: "auth.user",
      entityId: userId,
      entityLabel: data.email,
      newValue: { role: data.role, department: data.department || null, emailSent },
    });

    return { userId, emailSent };
  });

const userIdSchema = z.object({ userId: z.string().uuid() });

/** Re-send the invite email for a pending user. */
export const resendStaffInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: uRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !uRes?.user?.email) throw new Error(uErr?.message ?? "User has no email");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(uRes.user.email);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "staff.invite_resent",
      entityType: "auth.user",
      entityId: data.userId,
      entityLabel: uRes.user.email,
    });
    return { ok: true };
  });

/** Send a password recovery email to an existing user. */
export const sendStaffPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: uRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !uRes?.user?.email) throw new Error(uErr?.message ?? "User has no email");
    // generateLink('recovery') triggers the recovery email via the Auth API.
    const { error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: uRes.user.email,
    });
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "staff.password_reset_sent",
      entityType: "auth.user",
      entityId: data.userId,
      entityLabel: uRes.user.email,
    });
    return { ok: true };
  });

const disableSchema = z.object({
  userId: z.string().uuid(),
  disabled: z.boolean(),
});

/** Enable or disable a staff user (ban_duration on auth.users). */
export const setStaffUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => disableSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    if (data.userId === context.userId) throw new Error("You cannot disable your own account");
    if (data.disabled) {
      // If disabling the last owner, refuse.
      const { data: ownerRow } = await context.supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", data.userId)
        .eq("role", "owner")
        .maybeSingle();
      if (ownerRow) {
        const { count } = await context.supabase
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "owner");
        if ((count ?? 0) <= 1) throw new Error("Cannot disable the last owner");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // 100 years ≈ permanent; 'none' clears the ban.
    const ban_duration = data.disabled ? "876000h" : "none";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.auth.admin as any).updateUserById(data.userId, {
      ban_duration,
    });
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: data.disabled ? "staff.disabled" : "staff.enabled",
      entityType: "auth.user",
      entityId: data.userId,
    });
    return { ok: true };
  });

/** Remove ALL role assignments for a user (deactivates admin access). */
export const removeAllRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => userIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.supabase, context.userId, ROLE_ADMIN_ROLES);
    if (data.userId === context.userId) throw new Error("You cannot remove your own roles");
    // Prevent removing the last owner.
    const { data: ownerRow } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "owner")
      .maybeSingle();
    if (ownerRow) {
      const { count } = await context.supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) throw new Error("Cannot remove the last owner");
    }
    const { error } = await context.supabase.from("user_roles").delete().eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "staff.deactivated",
      entityType: "auth.user",
      entityId: data.userId,
    });
    return { ok: true };
  });