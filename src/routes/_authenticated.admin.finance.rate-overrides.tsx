import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createStayNasRateOverride,
  listStayNasRateOverrides,
  setStayNasRateOverrideStatus,
} from "@/domains/finance/rate-overrides.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/rate-overrides")({
  head: () => ({ meta: [{ title: "Rate Overrides — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: RateOverrides,
});

type Scope = "room_date" | "room_type" | "rate_plan" | "rate_plan_room_type";
type Override = {
  id: string; scope: Scope; rate_plan_id: string | null; room_type_id: string | null;
  room_id: string | null; effective_from: string; effective_to: string; nightly_rate: number;
  currency: string; reason: string; status: string; created_at: string;
};

function RateOverrides() {
  const listFn = useServerFn(listStayNasRateOverrides);
  const createFn = useServerFn(createStayNasRateOverride);
  const statusFn = useServerFn(setStayNasRateOverrideStatus);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["staynas.rate-overrides"],
    queryFn: () => listFn(),
  });
  const [scope, setScope] = useState<Scope>("room_date");
  const [ratePlanId, setRatePlanId] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: {
      scope,
      rate_plan_id: scope === "rate_plan" || scope === "rate_plan_room_type" ? ratePlanId : null,
      room_type_id: scope === "room_type" || scope === "rate_plan_room_type" ? roomTypeId : null,
      room_id: scope === "room_date" ? roomId : null,
      effective_from: from,
      effective_to: scope === "room_date" ? from : to,
      nightly_rate: Number(rate),
      currency: String(data?.property?.currency ?? "").toUpperCase(),
      reason,
    } }),
    onSuccess: () => {
      toast.success("Rate override proposal created.");
      setRate(""); setReason(""); setFrom(""); setTo("");
      void qc.invalidateQueries({ queryKey: ["staynas.rate-overrides"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeStatus = useMutation({
    mutationFn: (item: { id: string; scope: Scope; status: "approved" | "rejected" | "revoked" }) =>
      statusFn({ data: item }),
    onSuccess: () => {
      toast.success("Rate override status updated.");
      void qc.invalidateQueries({ queryKey: ["staynas.rate-overrides"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const plans = data?.plans ?? [];
  const roomTypes = data?.roomTypes ?? [];
  const rooms = data?.rooms ?? [];
  const validTarget =
    (scope === "room_date" && !!roomId && !!from) ||
    (scope === "room_type" && !!roomTypeId && !!from && !!to) ||
    (scope === "rate_plan" && !!ratePlanId && !!from && !!to) ||
    (scope === "rate_plan_room_type" && !!ratePlanId && !!roomTypeId && !!from && !!to);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rate Overrides"
        description="Controlled, property-scoped rate changes with approval, attribution and immutable audit history."
        actions={<a className="text-sm text-primary hover:underline" href="/admin/finance/rate-plans">Rate Plans</a>}
      />
      {data?.property && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{data.property.name}</span>
          <Badge variant="outline">{String(data.property.currency).toUpperCase()}</Badge>
          <span>{data.property.timezone}</span>
        </div>
      )}
      <SectionCard title="Create override proposal" description="Every proposal starts pending. Approval is separately recorded; approved commercial terms are immutable. SPE-04 precedence: approved exact-date override → published daily rate → seasonal rate → inherited/base rate.">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">Override scope
            <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" value={scope} onChange={e => {
              setScope(e.target.value as Scope); setRatePlanId(""); setRoomTypeId(""); setRoomId("");
            }}>
              <option value="room_date">Exact room and date</option>
              <option value="room_type">Room type and date range</option>
              <option value="rate_plan">Rate plan and date range</option>
              <option value="rate_plan_room_type">Rate plan + room type</option>
            </select>
          </label>
          {(scope === "rate_plan" || scope === "rate_plan_room_type") && (
            <label className="text-sm">Rate plan
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" value={ratePlanId} onChange={e => setRatePlanId(e.target.value)}>
                <option value="">Choose rate plan</option>
                {plans.map((plan: {id:string;name:string;code:string;publication_status:string}) =>
                  <option key={plan.id} value={plan.id}>{plan.name} ({plan.code}) · {plan.publication_status}</option>)}
              </select>
            </label>
          )}
          {(scope === "room_type" || scope === "rate_plan_room_type") && (
            <label className="text-sm">Room type
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" value={roomTypeId} onChange={e => setRoomTypeId(e.target.value)}>
                <option value="">Choose room type</option>
                {roomTypes.map((item: {id:string;name:string}) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          {scope === "room_date" && (
            <label className="text-sm">Room
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" value={roomId} onChange={e => setRoomId(e.target.value)}>
                <option value="">Choose room</option>
                {rooms.map((item: {id:string;name:string}) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm">Effective from
            <Input className="mt-1" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          {scope !== "room_date" && (
            <label className="text-sm">Effective to
              <Input className="mt-1" type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} />
            </label>
          )}
          <label className="text-sm">Nightly rate ({String(data?.property?.currency ?? "").toUpperCase()})
            <Input className="mt-1" type="number" min="0.01" step="0.01" value={rate} onChange={e => setRate(e.target.value)} />
          </label>
          <label className="text-sm md:col-span-3">Reason
            <Input className="mt-1" placeholder="Explain why this override is required" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={!validTarget || !rate || Number(rate) <= 0 || reason.trim().length < 5 || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Create pending proposal"}
          </Button>
          <span className="text-xs text-muted-foreground">Currency is locked to the active property. Rate changes do not change room availability or block state.</span>
        </div>
      </SectionCard>

      {isLoading || !data ? <LoadingState /> : (
        <>
          <SectionCard title="Override register" description="Pending proposals require approval. Approved exact room/date overrides update only room_inventory.price_override; rate-plan and room-type scopes are retained for the SPE-04 resolver.">
            <div className="space-y-3">
              {(data.overrides as Override[]).map(item => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.status === "approved" ? "default" : item.status === "pending" ? "secondary" : "outline"}>{item.status}</Badge>
                    <Badge variant="outline">{item.scope.replaceAll("_", " ")}</Badge>
                    <span className="font-medium">{item.nightly_rate.toLocaleString()} {item.currency}</span>
                    <span className="text-xs text-muted-foreground">{item.effective_from} → {item.effective_to}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm">{item.reason}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {item.rate_plan_id ? `Plan ${item.rate_plan_id} · ` : ""}
                    {item.room_type_id ? `Room type ${item.room_type_id} · ` : ""}
                    {item.room_id ? `Room ${item.room_id}` : ""}
                  </p>
                  {item.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => changeStatus.mutate({id:item.id,scope:item.scope,status:"approved"})}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => changeStatus.mutate({id:item.id,scope:item.scope,status:"rejected"})}>Reject</Button>
                    </div>
                  )}
                  {item.status === "approved" && (
                    <div className="mt-3"><Button size="sm" variant="outline" onClick={() => changeStatus.mutate({id:item.id,scope:item.scope,status:"revoked"})}>Revoke</Button></div>
                  )}
                </div>
              ))}
              {!data.overrides.length && <p className="py-6 text-center text-sm text-muted-foreground">No override proposals recorded.</p>}
            </div>
          </SectionCard>
          <SectionCard title="Audit history" description="Append-only record of override changes and legacy inventory price_override updates.">
            <div className="space-y-2">
              {data.audit.map((event: {id:string;source:string;event_type:string;created_at:string;actor_id:string|null;before_state:unknown;after_state:unknown}) => (
                <details key={event.id} className="rounded-md border border-border p-3 text-sm">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <Badge variant="outline">{event.source.replaceAll("_"," ")}</Badge>
                    <span className="font-medium">{event.event_type.replaceAll("_"," ")}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">Actor: {event.actor_id ?? "System / legacy operation"}</p>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({before:event.before_state,after:event.after_state},null,2)}</pre>
                </details>
              ))}
              {!data.audit.length && <p className="py-6 text-center text-sm text-muted-foreground">No audit events recorded.</p>}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
