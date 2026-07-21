import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { ErrorState } from "@/components/os/ErrorState";
import { EmptyState } from "@/components/os/EmptyState";
import { Input } from "@/components/ui/input";
import { listActivityLogs, type ActivityLogEntry } from "@/lib/activity.functions";

export const Route = createFileRoute("/_authenticated/admin/staff/activity")({
  head: () => ({ meta: [{ title: "Activity Log — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ActivityLogPage,
});

function ActivityLogPage() {
  const fn = useServerFn(listActivityLogs);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["staff.activity", search],
    queryFn: () => fn({ data: { search: search || undefined, limit: 300 } }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity Log"
        description="Immutable audit trail of admin actions across Mtoni OS."
      />
      <div className="max-w-md">
        <Input
          placeholder="Search by action, actor, or entity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <SectionCard title="Recent activity" description={q.data ? `${q.data.length} entries` : undefined}>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState description={(q.error as Error)?.message} onRetry={() => q.refetch()} />
        ) : !q.data || q.data.length === 0 ? (
          <EmptyState title="No activity yet" description="Admin actions will appear here as they happen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--os-hairline)]">
                {q.data.map((row: ActivityLogEntry) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{row.actor_email ?? row.actor_id?.slice(0, 8) ?? "—"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.action}</td>
                    <td className="py-2 pr-3">
                      <div>{row.entity_label ?? row.entity_type}</div>
                      {row.entity_id && (
                        <div className="text-[11px] text-muted-foreground">{row.entity_id}</div>
                      )}
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
