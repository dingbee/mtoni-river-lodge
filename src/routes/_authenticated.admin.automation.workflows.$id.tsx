import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getWorkflow, saveWorkflow, deleteWorkflow } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/automation/workflows/$id")({
  head: () => ({ meta: [{ title: "Edit workflow — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: EditPage,
});

const TRIGGERS = [
  "reservation.created","reservation.updated","reservation.cancelled","reservation.checked_in","reservation.checked_out",
  "guest.created","guest.updated",
  "payment.received","review.published","article.published",
  "task.created","task.assigned","task.completed",
  "room.state_changed","ops.alert_raised","campaign.created",
];
const ACTION_TYPES = ["send_email","send_whatsapp","send_sms","notify_staff","create_task","update_tag","change_status","generate_invoice","assign_housekeeping","schedule_followup","add_note"];
const OPS = ["eq","neq","gt","gte","lt","lte","in","contains","exists"];

function EditPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getWorkflow);
  const save = useServerFn(saveWorkflow);
  const del = useServerFn(deleteWorkflow);
  const q = useQuery({ queryKey: ["awe-workflow", id], queryFn: () => get({ data: { id } }) });
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data]); // eslint-disable-line
  if (!form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const update = (patch: any) => setForm({ ...form, ...patch });
  const updCondition = (i: number, patch: any) => {
    const conds = [...(form.conditions ?? [])]; conds[i] = { ...conds[i], ...patch }; update({ conditions: conds });
  };
  const updAction = (i: number, patch: any) => {
    const acts = [...(form.actions ?? [])]; acts[i] = { ...acts[i], ...patch }; update({ actions: acts });
  };

  const saveM = useMutation({
    mutationFn: () => save({ data: { id, name: form.name, description: form.description ?? undefined, trigger_event: form.trigger_event, conditions: form.conditions ?? [], actions: form.actions ?? [], enabled: !!form.enabled, requires_approval: !!form.requires_approval, approver_roles: form.approver_roles ?? [], is_template: false } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["awe-workflows"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); nav({ to: "/admin/automation/workflows" }); },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Edit workflow" description="Configure trigger, conditions, and actions." />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">Name<Input value={form.name ?? ""} onChange={(e) => update({ name: e.target.value })} /></label>
        <label className="text-sm">Trigger event
          <select className="mt-1 w-full rounded border bg-background p-2" value={form.trigger_event} onChange={(e) => update({ trigger_event: e.target.value })}>
            {TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm">Description<Textarea rows={2} value={form.description ?? ""} onChange={(e) => update({ description: e.target.value })} /></label>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.enabled} onChange={(e) => update({ enabled: e.target.checked })} /> Enabled</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.requires_approval} onChange={(e) => update({ requires_approval: e.target.checked })} /> Require approval</label>
      </div>

      <section className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Conditions (all must match)</h3>
          <Button size="sm" variant="outline" onClick={() => update({ conditions: [...(form.conditions ?? []), { field: "meta.status", op: "eq", value: "" }] })}>Add condition</Button>
        </div>
        <ul className="space-y-2">
          {(form.conditions ?? []).map((c: any, i: number) => (
            <li key={i} className="grid gap-2 md:grid-cols-[1fr_120px_1fr_auto]">
              <Input placeholder="field (e.g. meta.status)" value={c.field ?? ""} onChange={(e) => updCondition(i, { field: e.target.value })} />
              <select className="rounded border bg-background p-2" value={c.op ?? "eq"} onChange={(e) => updCondition(i, { op: e.target.value })}>
                {OPS.map((o) => <option key={o}>{o}</option>)}
              </select>
              <Input placeholder="value" value={c.value ?? ""} onChange={(e) => updCondition(i, { value: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => update({ conditions: form.conditions.filter((_: any, j: number) => j !== i) })}>×</Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Actions (run in order)</h3>
          <Button size="sm" variant="outline" onClick={() => update({ actions: [...(form.actions ?? []), { type: "notify_staff", title: "" }] })}>Add action</Button>
        </div>
        <ul className="space-y-2">
          {(form.actions ?? []).map((a: any, i: number) => (
            <li key={i} className="grid gap-2 md:grid-cols-[180px_1fr_1fr_auto]">
              <select className="rounded border bg-background p-2" value={a.type} onChange={(e) => updAction(i, { type: e.target.value })}>
                {ACTION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <Input placeholder="title / template" value={a.title ?? a.template ?? ""} onChange={(e) => updAction(i, { title: e.target.value })} />
              <Input placeholder="role / extra" value={a.role ?? ""} onChange={(e) => updAction(i, { role: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => update({ actions: form.actions.filter((_: any, j: number) => j !== i) })}>×</Button>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex gap-2">
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>{saveM.isPending ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={() => delM.mutate()}>Delete</Button>
      </div>
    </div>
  );
}