import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { ErrorState } from "@/components/os/ErrorState";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { listStaffUsers, type StaffUser } from "@/lib/staff.functions";
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

export const Route = createFileRoute("/_authenticated/admin/staff/users")({
  head: () => ({ meta: [{ title: "Users — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: StaffUsersPage,
});

function StaffUsersPage() {
  const fn = useServerFn(listStaffUsers);
  const q = useQuery({ queryKey: ["staff.users"], queryFn: () => fn(), staleTime: 60_000 });

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Everyone with access to Mtoni OS and the roles they hold." />
      <SectionCard title="Team members" description={q.data ? `${q.data.length} users` : undefined}>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState description={(q.error as Error)?.message} onRetry={() => q.refetch()} />
        ) : !q.data || q.data.length === 0 ? (
          <EmptyState title="No staff users yet" description="Assign a role from the Roles screen to add someone." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Roles</th>
                  <th className="py-2 pr-3">Last sign-in</th>
                  <th className="py-2 pr-3">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--os-hairline)]">
                {q.data.map((u: StaffUser) => (
                  <tr key={u.user_id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{u.full_name ?? u.email ?? u.user_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">{u.email ?? "—"}</div>
                    </td>
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
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
