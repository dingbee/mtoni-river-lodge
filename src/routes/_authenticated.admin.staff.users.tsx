import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Check, MoreHorizontal, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { ErrorState } from "@/components/os/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import {
  APP_ROLES,
  inviteStaffUser,
  listStaffUsers,
  removeAllRoles,
  resendStaffInvite,
  sendStaffPasswordReset,
  setStaffUserDisabled,
  type AppRole,
  type StaffUser,
} from "@/lib/staff.functions";
import { ROLE_LABELS, type Role, useCurrentUserRoles } from "@/lib/permissions";

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

export const Route = createFileRoute("/_authenticated/admin/staff/users")({
  head: () => ({ meta: [{ title: "Users — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: StaffUsersPage,
});

const STATUS_LABEL: Record<StaffUser["status"], string> = {
  pending: "Pending Invitation",
  active: "Active",
  disabled: "Disabled",
};
const STATUS_TONE: Record<StaffUser["status"], string> = {
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  disabled: "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

const INVITE_ROLE_OPTIONS: AppRole[] = [
  "owner",
  "manager",
  "reception",
  "housekeeping",
  "finance",
  "marketing",
  "editor",
];

function StaffUsersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listStaffUsers);
  const inviteFn = useServerFn(inviteStaffUser);
  const resendFn = useServerFn(resendStaffInvite);
  const resetFn = useServerFn(sendStaffPasswordReset);
  const disableFn = useServerFn(setStaffUserDisabled);
  const removeRolesFn = useServerFn(removeAllRoles);

  const rolesQ = useCurrentUserRoles();
  const canManage = (rolesQ.data ?? []).some((r) => r === "owner");

  const q = useQuery({ queryKey: ["staff.users"], queryFn: () => listFn(), staleTime: 60_000 });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff.users"] });
    qc.invalidateQueries({ queryKey: ["staff.role-assignments"] });
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; description: string; onConfirm: () => void }>(null);

  const inviteM = useAdminMutation({
    mutationFn: (v: {
      fullName: string;
      email: string;
      role: AppRole;
      department?: string;
      notes?: string;
    }) => inviteFn({ data: v }),
    onSuccessToast: (data) =>
      data.emailSent ? "Invitation sent" : "User linked and role assigned",
    onSuccess: () => {
      invalidate();
      setInviteOpen(false);
    },
  });
  const resendM = useAdminMutation({
    mutationFn: (v: { userId: string }) => resendFn({ data: v }),
    successMessage: "Invitation re-sent",
    onSuccess: invalidate,
  });
  const resetM = useAdminMutation({
    mutationFn: (v: { userId: string }) => resetFn({ data: v }),
    successMessage: "Password reset email sent",
  });
  const disableM = useAdminMutation({
    mutationFn: (v: { userId: string; disabled: boolean }) => disableFn({ data: v }),
    onSuccessToast: (_d, v) => (v.disabled ? "User disabled" : "User enabled"),
    onSuccess: invalidate,
  });
  const removeRolesM = useAdminMutation({
    mutationFn: (v: { userId: string }) => removeRolesFn({ data: v }),
    successMessage: "Access removed",
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Everyone with access to Mtoni OS. Invite new staff, manage roles, and control account status."
        actions={
          canManage ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 size-4" /> Invite staff member
            </Button>
          ) : undefined
        }
      />
      <SectionCard title="Team members" description={q.data ? `${q.data.length} users` : undefined}>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState description={(q.error as Error)?.message} onRetry={() => q.refetch()} />
        ) : !q.data || q.data.length === 0 ? (
          <EmptyState
            title="No staff users yet"
            description={
              canManage
                ? "Click ‘Invite staff member’ above to send an invitation email. The user will appear here as ‘Pending Invitation’ until they accept."
                : "Ask an owner or admin to invite new staff members."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">User ID</th>
                  <th className="py-2 pr-3">Added</th>
                  <th className="py-2 pr-3">Last sign-in</th>
                  {canManage && <th className="py-2 pr-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--os-hairline)]">
                {q.data.map((u: StaffUser) => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{u.full_name ?? u.email ?? u.user_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{u.department ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className="rounded-full border border-[color:var(--os-hairline)] bg-[color:var(--os-surface-2)] px-2 py-0.5 text-[11px]"
                          >
                            {ROLE_LABELS[r as Role] ?? r}
                          </span>
                        ))}
                        {u.roles.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[u.status]}`}
                      >
                        {STATUS_LABEL[u.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <CopyableUuid value={u.user_id} />
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}
                    </td>
                    {canManage && (
                      <td className="py-2 pr-3 text-right">
                        <UserRowActions
                          user={u}
                          onCopyId={async () => {
                            try {
                              await navigator.clipboard.writeText(u.user_id);
                              toast.success("User ID copied");
                            } catch {
                              toast.error("Failed to copy");
                            }
                          }}
                          onResend={() => resendM.mutate({ userId: u.user_id })}
                          onReset={() => resetM.mutate({ userId: u.user_id })}
                          onDisable={() =>
                            setConfirm({
                              title: "Disable this user?",
                              description: `${u.email ?? u.user_id} will no longer be able to sign in until re-enabled.`,
                              onConfirm: () =>
                                disableM.mutate({ userId: u.user_id, disabled: true }),
                            })
                          }
                          onEnable={() => disableM.mutate({ userId: u.user_id, disabled: false })}
                          onDeactivate={() =>
                            setConfirm({
                              title: "Remove all access?",
                              description: `All role assignments for ${u.email ?? u.user_id} will be removed. The account itself is preserved.`,
                              onConfirm: () => removeRolesM.mutate({ userId: u.user_id }),
                            })
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        submitting={inviteM.isPending}
        onSubmit={(v) => inviteM.mutate(v)}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserRowActions({
  user,
  onCopyId,
  onResend,
  onReset,
  onDisable,
  onEnable,
  onDeactivate,
}: {
  user: StaffUser;
  onCopyId: () => void;
  onResend: () => void;
  onReset: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onDeactivate: () => void;
}) {
  const isOwner = user.roles.includes("owner");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onCopyId}>Copy User ID</DropdownMenuItem>
        {user.status === "pending" && (
          <DropdownMenuItem onSelect={onResend}>Resend invitation</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onReset}>Send password reset</DropdownMenuItem>
        <DropdownMenuSeparator />
        {user.status === "disabled" ? (
          <DropdownMenuItem onSelect={onEnable}>Enable user</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onDisable} disabled={isOwner}>
            Disable user
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={onDeactivate}
          disabled={isOwner}
          className="text-destructive focus:text-destructive"
        >
          Deactivate (remove all roles)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (v: {
    fullName: string;
    email: string;
    role: AppRole;
    department?: string;
    notes?: string;
  }) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("reception");
  const [department, setDepartment] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setFullName("");
    setEmail("");
    setRole("reception");
    setDepartment("");
    setNotes("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite staff member</DialogTitle>
          <DialogDescription>
            An invitation email will be sent. The user will appear as ‘Pending Invitation’ until they set their password.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-name">Full name</Label>
            <Input
              id="invite-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Mushi"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@mtoniriverlodge.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLE_OPTIONS.filter((r) => APP_ROLES.includes(r)).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r as Role] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-department">Department (optional)</Label>
              <Input
                id="invite-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Reception, Housekeeping, …"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-notes">Notes (optional)</Label>
            <Textarea
              id="invite-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this staff member"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                fullName: fullName.trim(),
                email: email.trim(),
                role,
                department: department.trim() || undefined,
                notes: notes.trim() || undefined,
              })
            }
            disabled={submitting || fullName.trim().length < 2 || !email.trim()}
          >
            {submitting ? "Sending…" : "Send invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
