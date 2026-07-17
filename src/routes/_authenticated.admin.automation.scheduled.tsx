import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listScheduledJobs, toggleScheduledJob } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/automation/scheduled")({
  head: () => ({ meta: [{ title: "Scheduled Jobs — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: JobsPage,
});

function JobsPage() {
  const fn = useServerFn(listScheduledJobs);
  const t = useServerFn(toggleScheduledJob);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["awe-jobs"], queryFn: () => fn() });
  const rows: any[] = (q.data as any) ?? [];
  const m = useMutation({
    mutationFn: (j: any) => t({ data: { id: j.id, enabled: !j.enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["awe-jobs"] }),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Scheduled Jobs" description="Recurring reports and reminders." />
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((j) => (
          <li key={j.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <div className="font-medium">{j.name}</div>
              <div className="text-xs text-muted-foreground">{j.description} · <code>{j.cron_expression}</code> · {j.job_type}</div>
              {j.last_run_at && <div className="text-xs text-muted-foreground">Last: {new Date(j.last_run_at).toLocaleString()} ({j.last_status})</div>}
            </div>
            <Button size="sm" variant={j.enabled ? "secondary" : "outline"} onClick={() => m.mutate(j)}>{j.enabled ? "Enabled" : "Disabled"}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}