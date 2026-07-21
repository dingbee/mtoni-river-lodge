import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { ErrorState } from "@/components/os/ErrorState";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { useCurrentUserRoles } from "@/lib/permissions";
import {
  APP_ROLES,
  assignRole,
  listStaffUsers,
  listRoleAssignments,
  revokeRole,
  type AppRole,
  type StaffUser,
} from "@/lib/staff.functions";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

function CopyableUuid({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("User ID copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy User ID");
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <code className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
              {value}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              onClick={handleCopy}
              aria-label={copied ? "Copied" : "Copy User ID"}
            >
              {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs break-all">
          <p className="font-mono text-[11px]">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const Route = createFileRoute("/_authenticated/admin/staff/roles")({
  head: () => ({ meta: [{ title: "Roles — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: StaffRolesPage,
});

function StaffRolesPage() {
  const qc = useQueryClient();
  const usersFn = useServerFn(listStaffUsers);
  const assignmentsFn = useServerFn(listRoleAssignments);
  const assignFn = useServerFn(assignRole);
  const revokeFn = useServerFn(revokeRole);

  const rolesQ = useCurrentUserRoles();
  const canManage = (rolesQ.data ?? []).some((r) => r === "owner" || r === "admin");

  const usersQ = useQuery({ queryKey: ["staff.users"], queryFn: () => usersFn(), staleTime: 60_000 });
  const assignmentsQ = useQuery({
    queryKey: ["staff.role-assignments"],
    queryFn: () => assignmentsFn(),
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff.users"] });
    qc.invalidateQueries({ queryKey: ["staff.role-assignments"] });
  };

  const assignM = useAdminMutation({
    mutationFn: (v: { userId: string; role: AppRole }) => assignFn({ data: v }),
    successMessage: "Role granted",
    onSuccess: invalidate,
  });
  const revokeM = useAdminMutation({
    mutationFn: (v: { userId: string; role: AppRole }) => revokeFn({ data: v }),
    successMessage: "Role revoked",
    onSuccess: invalidate,
  });

  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("reception");
  const [newUserId, setNewUserId] = useState<string>("");

  return (
    <div className="space-y-6">
      <PageHeader title="Roles" description="Manage which roles each team member holds. Role capabilities are enforced by database policies." />

      {canManage && (
        <SectionCard title="Grant a role" description="Owner and admin only.">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Existing user</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an existing user…" />
                </SelectTrigger>
                <SelectContent>
                  {(usersQ.data ?? []).map((u: StaffUser) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.email ?? u.full_name ?? u.user_id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2">
                <label className="mb-1 block text-xs text-muted-foreground">…or paste a user UUID</label>
                <Input
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Role</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APP_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r as Role] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                disabled={assignM.isPending || (!selectedUser && !newUserId)}
                onClick={() =>
                  assignM.mutate({ userId: (newUserId || selectedUser).trim(), role: selectedRole })
                }
              >
                {assignM.isPending ? "Granting…" : "Grant role"}
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Current assignments"
        description={assignmentsQ.data ? `${assignmentsQ.data.length} assignments` : undefined}
      >
        {assignmentsQ.isLoading ? (
          <LoadingState />
        ) : assignmentsQ.isError ? (
          <ErrorState description={(assignmentsQ.error as Error)?.message} onRetry={() => assignmentsQ.refetch()} />
        ) : !assignmentsQ.data || assignmentsQ.data.length === 0 ? (
          <EmptyState title="No role assignments" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">User ID</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Granted</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--os-hairline)]">
                {assignmentsQ.data.map((a) => {
                  const user = (usersQ.data ?? []).find((u: StaffUser) => u.user_id === a.user_id);
                  return (
                    <tr key={a.id}>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{user?.email ?? user?.full_name ?? a.user_id.slice(0, 8)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <CopyableUuid value={a.user_id} />
                      </td>
                      <td className="py-2 pr-3">{ROLE_LABELS[a.role as Role] ?? a.role}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={revokeM.isPending}
                            onClick={() => revokeM.mutate({ userId: a.user_id, role: a.role })}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
