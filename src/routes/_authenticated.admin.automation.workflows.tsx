import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWorkflows, cloneWorkflow, deleteWorkflow, saveWorkflow } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/automation/workflows")({
  head: () => ({ meta: [{ title: "Workflows — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const fn = useServerFn(listWorkflows);
  const cloneFn = useServerFn(cloneWorkflow);
  const delFn = useServerFn(deleteWorkflow);
  const saveFn = useServerFn(saveWorkflow);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["awe-workflows"], queryFn: () => fn() });
  const rows: any[] = (q.data as any) ?? [];
  const templates = rows.filter((r) => r.is_template);
  const active = rows.filter((r) => !r.is_template);

  const toggle = useMutation({
    mutationFn: (w: any) => saveFn({ data: { ...w, enabled: !w.enabled, description: w.description ?? undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["awe-workflows"] }); toast.success("Updated"); },
  });
  const clone = useMutation({
    mutationFn: (id: string) => cloneFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["awe-workflows"] }); toast.success("Cloned"); },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["awe-workflows"] }); toast.success("Deleted"); },
  });

  const newBlank = useMutation({
    mutationFn: () => saveFn({ data: {
      name: "New workflow", trigger_event: "reservation.created",
      conditions: [], actions: [], enabled: false, requires_approval: false, approver_roles: [],
    }}),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["awe-workflows"] }); window.location.href = `/admin/automation/workflows/${r.id}`; },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Workflows" description="Automate operational and marketing tasks." />
      <div><Button size="sm" onClick={() => newBlank.mutate()}>New workflow</Button></div>
      <Section title={`Active workflows (${active.length})`}>
        {active.length === 0 ? <Empty text="No active workflows. Clone a template to get started." /> : (
          <ul className="divide-y rounded-lg border bg-card">
            {active.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link to={"/admin/automation/workflows/$id" as any} params={{ id: w.id }} className="font-medium hover:underline">{w.name}</Link>
                  <div className="text-xs text-muted-foreground truncate">{w.trigger_event} · {(w.actions ?? []).length} actions {w.requires_approval && "· approval required"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={w.enabled ? "secondary" : "outline"} onClick={() => toggle.mutate(w)}>{w.enabled ? "Enabled" : "Disabled"}</Button>
                  <Button size="sm" variant="outline" onClick={() => del.mutate(w.id)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Templates (${templates.length})`}>
        <ul className="grid gap-2 md:grid-cols-2">
          {templates.map((w) => (
            <li key={w.id} className="rounded-lg border bg-card p-3">
              <div className="text-sm font-medium">{w.name}</div>
              <div className="text-xs text-muted-foreground">{w.description}</div>
              <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => clone.mutate(w.id)}>Clone</Button></div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<section className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>);
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{text}</div>;
}