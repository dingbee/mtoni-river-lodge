import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listEscalations, updateEscalation, listEscalationSlaPolicies,
  updateEscalationSlaPolicy, updateEscalationReasonPriorityMap, listEscalationEvents, listEscalationSlaPolicyEvents, listEscalationAssignees,
} from "@/domains/ai/concierge/omnichannel.functions";
import type { EscalationRow, EscalationStatus } from "@/domains/ai/concierge/omnichannel.types";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/escalations")({
  head: () => ({ meta: [{ title: "Escalations — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: EscalationsPage,
});

function EscalationsPage() {
  const listFn = useServerFn(listEscalations);
  const updateFn = useServerFn(updateEscalation);
  const policiesFn = useServerFn(listEscalationSlaPolicies);
  const updatePolicyFn = useServerFn(updateEscalationSlaPolicy);
  const updateReasonMapFn = useServerFn(updateEscalationReasonPriorityMap);
  const assigneesFn = useServerFn(listEscalationAssignees);
  const policyEventsFn = useServerFn(listEscalationSlaPolicyEvents);
  const qc = useQueryClient();
  const [status, setStatus] = useState<EscalationStatus | "all">("open");
  const list = useQuery({ queryKey: ["oc.escalations", status], queryFn: () => listFn({ data: { status } }) });
  const policies = useQuery({ queryKey: ["oc.escalation-sla-policies"], queryFn: () => policiesFn() });
  const assignees = useQuery({ queryKey: ["oc.escalation-assignees"], queryFn: () => assigneesFn() });
  const policyEvents = useQuery({ queryKey: ["oc.escalation-sla-policy-events"], queryFn: () => policyEventsFn() });
  const patch = useMutation({
    mutationFn: async (v: { id: string; status?: EscalationStatus; assigned_to?: string | null; resolution_notes?: string; priority?: number }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.escalations"] }),
  });
  const saveReasonMap = useMutation({
    mutationFn: async (v: any) => updateReasonMapFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.escalation-sla-policies"] }),
  });
  const savePolicy = useMutation({
    mutationFn: async (v: any) => updatePolicyFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.escalation-sla-policies"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Escalations & SLA" description="Property-owned escalation lifecycle, response commitments, audit history and breach alerts." />
      <SectionCard title="Property SLA policies" description="Priority-specific acknowledgement, assignment and resolution targets. Default policies are 24/7; configure the property operating calendar where required.">
        {policies.isLoading && <p className="text-sm text-muted-foreground">Loading SLA policies…</p>}
        <div className="grid gap-3 lg:grid-cols-3">
          {(policies.data ?? []).map((policy: any) => (
            <SlaPolicyEditor key={policy.id} policy={policy} timezone={policy.property_timezone} saving={savePolicy.isPending} onSave={savePolicy.mutate} />
          ))}
        </div>
        {policies.data?.[0] && <ReasonPriorityEditor key={JSON.stringify(policies.data[0].reason_priority_map)} initial={policies.data[0].reason_priority_map} saving={saveReasonMap.isPending} onSave={saveReasonMap.mutate} />}
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">SLA policy change history ({policyEvents.data?.length ?? 0})</summary>
          <div className="mt-3 space-y-2">
            {(policyEvents.data ?? []).map((event: any) => (
              <div key={event.id} className="border-l-2 pl-3 py-1">
                <div className="text-sm font-medium">P{event.priority} · {event.event_type}</div>
                <div className="text-xs text-muted-foreground">{formatPropertyTime(event.occurred_at,policies.data?.[0]?.property_timezone ?? "UTC")} · {event.actor_id ?? "System"}</div>
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer">Changed policy snapshot</summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({before:event.old_policy,after:event.new_policy},null,2)}</pre>
                </details>
              </div>
            ))}
            {policyEvents.data?.length === 0 && <p className="text-xs text-muted-foreground">No policy changes recorded.</p>}
          </div>
        </details>
        {savePolicy.isError && <p className="text-sm text-destructive">{String(savePolicy.error)}</p>}
        {saveReasonMap.isError && <p className="text-sm text-destructive">{String(saveReasonMap.error)}</p>}
      </SectionCard>

      <SectionCard title="Escalation queue" actions={
        <div className="flex flex-wrap gap-2 text-sm">
          {(["open","assigned","acknowledged","in_progress","resolved","dismissed","all"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)}
              className={"rounded px-2 py-1 " + (status === s ? "bg-primary text-primary-foreground" : "bg-muted")}>{s.replace("_"," ")}</button>
          ))}
        </div>
      }>
        <div className="space-y-3">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No escalations.</p>}
          {list.data?.map((e: EscalationRow) => (
            <EscalationCard key={e.id} row={e} assignees={assignees.data ?? []} onPatch={patch.mutate} />
          ))}
        </div>
        {patch.isError && <p className="mt-3 text-sm text-destructive">{String(patch.error)}</p>}
      </SectionCard>
    </div>
  );
}

function ReasonPriorityEditor({ initial, saving, onSave }: { initial: Record<string,number>; saving:boolean; onSave:(v:any)=>void }) {
  const [map,setMap] = useState(JSON.stringify(initial ?? {},null,2));
  const [error,setError] = useState("");
  return <div className="rounded-lg border p-3 space-y-2 lg:col-span-3">
    <strong className="text-sm">Reason-to-priority severity mapping</strong>
    <p className="text-xs text-muted-foreground">Applied when a new Concierge escalation is created. Values: 1 = critical, 2 = high, 3 = standard.</p>
    <Textarea rows={4} value={map} onChange={(e)=>setMap(e.target.value)} />
    {error && <p className="text-xs text-destructive">{error}</p>}
    <Button size="sm" disabled={saving} onClick={()=>{
      try {
        const reason_priority_map = JSON.parse(map);
        const required = ["low_confidence","complaint","payment_issue","complex_request","human_requested","other"];
        if (required.some((key)=>![1,2,3].includes(reason_priority_map[key]))) throw new Error("Map all six reasons to priority 1, 2 or 3.");
        setError(""); onSave({reason_priority_map});
      } catch(e) { setError(e instanceof Error ? e.message : "Invalid reason map JSON."); }
    }}>Save reason mapping</Button>
  </div>;
}

function SlaPolicyEditor({ policy, timezone, saving, onSave }: { policy: any; timezone: string; saving: boolean; onSave: (v: any) => void }) {
  const [ack, setAck] = useState(String(policy.acknowledgement_minutes));
  const [assign, setAssign] = useState(String(policy.assignment_minutes));
  const [resolve, setResolve] = useState(String(policy.resolution_minutes));
  const [warning, setWarning] = useState(String(policy.warning_percent));
  const [enabled, setEnabled] = useState(Boolean(policy.enabled));
  const [businessHours, setBusinessHours] = useState(Boolean(policy.business_hours_only));
  const [calendar, setCalendar] = useState(JSON.stringify(policy.operating_hours ?? { mode: "24x7" }, null, 2));
  const [calendarError, setCalendarError] = useState("");
  const save = () => {
    try {
      const operating_hours = JSON.parse(calendar);
      setCalendarError("");
      onSave({
        id: policy.id, enabled, acknowledgement_minutes: Number(ack),
        assignment_minutes: Number(assign), resolution_minutes: Number(resolve),
        warning_percent: Number(warning), business_hours_only: businessHours, operating_hours,
      });
    } catch { setCalendarError("Operating calendar must be valid JSON."); }
  };
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <strong>Priority P{policy.priority}</strong>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="space-y-1">Acknowledge (min)<input className="w-full rounded border bg-background px-2 py-1" type="number" min="1" max="10080" value={ack} onChange={(e) => setAck(e.target.value)} /></label>
        <label className="space-y-1">Assign (min)<input className="w-full rounded border bg-background px-2 py-1" type="number" min="1" max="10080" value={assign} onChange={(e) => setAssign(e.target.value)} /></label>
        <label className="space-y-1">Resolve (min)<input className="w-full rounded border bg-background px-2 py-1" type="number" min="1" max="43200" value={resolve} onChange={(e) => setResolve(e.target.value)} /></label>
        <label className="space-y-1">Alert at (%)<input className="w-full rounded border bg-background px-2 py-1" type="number" min="1" max="99" value={warning} onChange={(e) => setWarning(e.target.value)} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={businessHours} onChange={(e) => setBusinessHours(e.target.checked)} /> Count operating hours only</label>
      <details className="text-xs">
        <summary className="cursor-pointer font-medium">Operating calendar (property local time)</summary>
        <p className="my-2 text-muted-foreground">Use property timezone {timezone} · mode 24x7 or weekly with mon–sun arrays of {"{start,end}"} windows.</p>
        <Textarea rows={7} value={calendar} onChange={(e) => setCalendar(e.target.value)} />
        {calendarError && <p className="text-destructive">{calendarError}</p>}
      </details>
      <Button size="sm" disabled={saving} onClick={save}>Save P{policy.priority} policy</Button>
    </div>
  );
}

function formatPropertyTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined,{timeZone:timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
}

function EscalationCard({ row, assignees, onPatch }: {
  row: EscalationRow; assignees: Array<{user_id:string;role:string}>;
  onPatch: (v: {id:string;status?:EscalationStatus;assigned_to?:string|null;resolution_notes?:string;priority?:number}) => void;
}) {
  const eventsFn = useServerFn(listEscalationEvents);
  const [notes, setNotes] = useState(row.resolution_notes ?? "");
  const [assignee, setAssignee] = useState(row.assigned_to ?? "");
  const [priority, setPriority] = useState(String(row.priority));
  const [historyOpen, setHistoryOpen] = useState(false);
  const history = useQuery({
    queryKey: ["oc.escalation-events", row.id],
    queryFn: () => eventsFn({ data: { escalation_id: row.id } }),
    enabled: historyOpen,
  });
  const due = [
    { label:"Assignment", at:row.assignment_due_at, completedAt:row.assigned_at, cancelled:false },
    { label:"Acknowledgement", at:row.acknowledgement_due_at, completedAt:row.acknowledged_at, cancelled:false },
    { label:"Resolution", at:row.resolution_due_at, completedAt:row.status === "resolved" ? row.resolved_at : null, cancelled:row.status === "dismissed" },
  ];
  const now = Date.now();
  return (
    <div className="rounded-lg border p-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{row.channel}</Badge><Badge variant="outline">{row.reason}</Badge><Badge>{row.status.replace("_"," ")}</Badge>
        <Badge variant={row.priority === 1 ? "destructive" : "secondary"}>P{row.priority}</Badge>
        <span className="text-muted-foreground">{formatDistanceToNow(new Date(row.created_at),{addSuffix:true})}</span>
        {typeof row.ai_confidence === "number" && <span className="text-muted-foreground">conf {Math.round(row.ai_confidence*100)}%</span>}
      </div>
      {row.summary && <p className="whitespace-pre-wrap">{row.summary}</p>}
      {(row.sla_alerts ?? []).length > 0 && <div className="flex flex-wrap gap-2">
        {row.sla_alerts?.map((alert: any) => <Badge key={alert.id} variant={alert.alert_type === "breached" ? "destructive" : "secondary"}>
          {alert.milestone} {alert.alert_type === "breached" ? "breached" : "approaching"}
        </Badge>)}
      </div>}
      <div className="grid gap-2 sm:grid-cols-3">
        {due.map(({label,at,completedAt,cancelled}) => {
          const dueTime = at ? new Date(at).getTime() : null;
          const completedTime = completedAt ? new Date(completedAt).getTime() : null;
          const assignmentTimeUnknown = label === "Assignment" && Boolean(row.assigned_to) && completedTime === null;
          const overdue = completedTime === null && !cancelled && !assignmentTimeUnknown && dueTime !== null && dueTime < now;
          const breached = completedTime !== null && dueTime !== null && completedTime > dueTime;
          const met = completedTime !== null && dueTime !== null && completedTime <= dueTime;
          const result = cancelled ? "Cancelled" : assignmentTimeUnknown ? "Assigned (time unavailable)" : completedTime !== null ? (dueTime === null ? "Completed" : met ? "Met" : "Breached") : at ? formatPropertyTime(at,row.property_timezone ?? "UTC") : "No deadline";
          return <div key={label} className="rounded bg-muted/50 p-2">
            <div className="text-xs text-muted-foreground">{label} SLA</div>
            <div className="font-medium">{result}</div>
            {overdue && <Badge variant="destructive">Overdue</Badge>}
            {breached && <Badge variant="destructive">Missed target</Badge>}
          </div>;
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs">Priority / severity
          <select className="rounded border bg-background px-2 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="1">P1 · Critical</option>
            <option value="2">P2 · High</option>
            <option value="3">P3 · Standard</option>
          </select>
        </label>
        <Button size="sm" variant="outline" disabled={Number(priority) === row.priority || ["resolved","dismissed"].includes(row.status)} onClick={() => onPatch({id:row.id,priority:Number(priority)})}>Update priority</Button>
        <label className="min-w-56 flex-1 space-y-1 text-xs">Assign to property staff
          <select className="w-full rounded border bg-background px-2 py-2 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {assignees.map((m) => <option key={m.user_id} value={m.user_id}>{m.role} · {m.user_id.slice(0,8)}</option>)}
          </select>
        </label>
        <Button size="sm" variant="outline" disabled={!assignee || assignee === row.assigned_to || ["resolved","dismissed"].includes(row.status)} onClick={() => onPatch({id:row.id,status:row.status === "open" ? "assigned" : undefined,assigned_to:assignee})}>Assign / reassign</Button>
        {row.assigned_to && !["resolved","dismissed"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => onPatch({id:row.id,status:"open",assigned_to:null})}>Unassign</Button>}
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Resolution notes…" />
      <div className="flex flex-wrap gap-2">
        {row.status === "assigned" && <Button size="sm" onClick={() => onPatch({id:row.id,status:"acknowledged"})}>Acknowledge</Button>}
        {row.status === "acknowledged" && <Button size="sm" variant="secondary" onClick={() => onPatch({id:row.id,status:"in_progress"})}>Start work</Button>}
        {row.status === "in_progress" && <Button size="sm" variant="secondary" onClick={() => onPatch({id:row.id,status:"resolved",resolution_notes:notes})}>Resolve</Button>}
        {!["resolved","dismissed"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => onPatch({id:row.id,status:"dismissed",resolution_notes:notes})}>Cancel</Button>}
        {["resolved","dismissed"].includes(row.status) && <Button size="sm" variant="outline" onClick={() => onPatch({id:row.id,status:"open"})}>Reopen</Button>}
        <Button size="sm" variant="ghost" onClick={() => setHistoryOpen((v) => !v)}>{historyOpen ? "Hide history" : "Audit history"}</Button>
      </div>
      {historyOpen && <div className="rounded bg-muted/40 p-3">
        <div className="mb-2 font-medium">Lifecycle history</div>
        {history.isLoading && <p>Loading history…</p>}
        {(history.data ?? []).map((event: any) => <div key={event.id} className="border-l-2 pl-3 py-1">
          <div className="font-medium">{event.event_type.replaceAll("_"," ")}</div>
          <div className="text-xs text-muted-foreground">{formatPropertyTime(event.occurred_at,row.property_timezone ?? "UTC")} · {event.actor_id ?? "System"} {event.from_status ? "· "+event.from_status+" → "+event.to_status : ""} {event.from_assignee || event.to_assignee ? "· "+(event.from_assignee ?? "unassigned")+" → "+(event.to_assignee ?? "unassigned") : ""} {event.metadata?.from !== undefined ? "· "+event.metadata.from+" → "+event.metadata.to : ""}</div>
          {event.metadata?.resolution_notes && <p className="mt-1 text-xs">{event.metadata.resolution_notes}</p>}
        </div>)}
        {history.data?.length === 0 && <p className="text-xs text-muted-foreground">No lifecycle events recorded.</p>}
      </div>}
    </div>
  );
}
