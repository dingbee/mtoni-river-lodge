import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listFounderProviderBindings,
  listFounderProviderProperties,
  listFounderWebhookOperations,
  reprocessDeadLetterProviderWebhook,
  saveFounderProviderBinding,
  verifyFounderProviderBinding,
} from "@/domains/ai/concierge/founder-provider-settings.functions";
import { listFounderConciergeEntitlements, setFounderConciergeEntitlement } from "@/domains/ai/concierge/concierge.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/providers")({
  head: () => ({ meta: [{ title: "Provider Routing — Founder Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: FounderProviderSettings,
});

function FounderProviderSettings() {
  const bindingsFn = useServerFn(listFounderProviderBindings);
  const propertiesFn = useServerFn(listFounderProviderProperties);
  const saveFn = useServerFn(saveFounderProviderBinding);
  const verifyFn = useServerFn(verifyFounderProviderBinding);
  const webhookOpsFn = useServerFn(listFounderWebhookOperations);
  const reprocessWebhookFn = useServerFn(reprocessDeadLetterProviderWebhook);
  const entitlementsFn = useServerFn(listFounderConciergeEntitlements);
  const setEntitlementFn = useServerFn(setFounderConciergeEntitlement);
  const qc = useQueryClient();
  const bindings = useQuery({ queryKey: ["founder.provider-bindings"], queryFn: () => bindingsFn() });
  const webhookOps = useQuery({ queryKey: ["founder.webhook-operations"], queryFn: () => webhookOpsFn() });
  const properties = useQuery({ queryKey: ["founder.provider-properties"], queryFn: () => propertiesFn() });
  const entitlements = useQuery({ queryKey: ["founder.concierge-entitlements"], queryFn: () => entitlementsFn() });
  const entitlementMutation = useMutation({
    mutationFn: (input: { property_id: string; enabled: boolean }) => setEntitlementFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["founder.concierge-entitlements"] }),
  });
  const [provider, setProvider] = useState<"meta_cloud_api" | "resend">("meta_cloud_api");
  const [accountId, setAccountId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [inboundEnabled, setInboundEnabled] = useState(false);
  const [outboundEnabled, setOutboundEnabled] = useState(false);
  const [secretRef, setSecretRef] = useState("");
  const [graphVersion, setGraphVersion] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      provider, external_account_id: accountId, external_endpoint_id: endpointId,
      property_id: propertyId, enabled, inbound_enabled: inboundEnabled,
      outbound_enabled: outboundEnabled, credential_secret_ref: secretRef,
      max_attempts: Number(maxAttempts),
      graph_api_version: provider === "meta_cloud_api" ? graphVersion : null,
    } }),
    onSuccess: () => { setAccountId(""); setEndpointId(""); setSecretRef(""); setMaxAttempts("3"); qc.invalidateQueries({ queryKey: ["founder.provider-bindings"] }); },
  });
  const verify = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["founder.provider-bindings"] }),
  });
  const reprocessWebhook = useMutation({
    mutationFn: (id: string) => reprocessWebhookFn({
      data: {
        id,
        reason: "Founder reviewed the dead-letter event and confirmed the original property binding is still authorized for one-time reprocessing.",
      },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["founder.webhook-operations"] }),
  });
  return <div className="space-y-6">
    <PageHeader title="Provider Routing" description="Founder Admin · Nolmark CDMA. Map verified provider endpoints to one StayNas property." />
    <SectionCard title="AI Concierge property entitlements">
      <p className="mb-3 text-sm text-muted-foreground">Only Nolmark founder administrators can grant or suspend AI Concierge access. Properties without an explicit enabled entitlement are denied by the public runtime. Usage is recorded in tokens returned by the provider; no price, credit conversion or quota is assumed here.</p>
      <div className="space-y-2">
        {entitlements.data?.map((property: any) => <div key={property.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <div><div className="font-medium">{property.name}</div><div className="text-xs text-muted-foreground">{property.status}</div></div>
          <div className="flex items-center gap-2">
            <Badge variant={property.enabled ? "default" : "secondary"}>{property.enabled ? "Enabled" : "Not entitled"}</Badge>
            <Button size="sm" variant={property.enabled ? "outline" : "default"} disabled={entitlementMutation.isPending || property.status !== "active"} onClick={() => entitlementMutation.mutate({ property_id: property.id, enabled: !property.enabled })}>{property.enabled ? "Suspend" : "Enable"}</Button>
          </div>
        </div>)}
        {entitlements.isLoading && <p className="text-sm text-muted-foreground">Loading entitlement settings…</p>}
        {entitlements.isError && <p className="text-sm text-destructive">Unable to load founder AI entitlements.</p>}
        {!entitlements.isLoading && !entitlements.data?.length && <p className="text-sm text-muted-foreground">No properties found.</p>}
        {entitlementMutation.isError && <p className="text-sm text-destructive">Unable to update the entitlement. Verify founder access and database schema.</p>}
      </div>
    </SectionCard>
    <SectionCard title="Add or update provider mapping">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>Provider</span><select className="w-full rounded-md border bg-background p-2" value={provider} onChange={e => setProvider(e.target.value as typeof provider)}><option value="meta_cloud_api">Meta WhatsApp Cloud API</option><option value="resend">Resend Email</option></select></label>
        <label className="space-y-1 text-sm"><span>StayNas property</span><select className="w-full rounded-md border bg-background p-2" value={propertyId} onChange={e => setPropertyId(e.target.value)}><option value="">Select property</option>{properties.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Provider account ID</span><input className="w-full rounded-md border bg-background p-2" value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="Meta business account / Resend account identifier" /></label>
        <label className="space-y-1 text-sm"><span>Endpoint ID</span><input className="w-full rounded-md border bg-background p-2" value={endpointId} onChange={e => setEndpointId(e.target.value)} placeholder={provider === "meta_cloud_api" ? "WhatsApp phone number ID" : "Verified sender email identity"} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable this provider binding</label>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>Server-side secret reference (name only)</span><input className="w-full rounded-md border bg-background p-2" value={secretRef} onChange={e => setSecretRef(e.target.value)} placeholder="STAYNAS_PROVIDER_META_PROPERTY_A" /></label>
        {provider === "meta_cloud_api" && <label className="space-y-1 text-sm"><span>Meta Graph API version</span><input className="w-full rounded-md border bg-background p-2" value={graphVersion} onChange={e => setGraphVersion(e.target.value)} placeholder="vXX.X" /></label>}
        <label className="space-y-1 text-sm"><span>Maximum dispatch attempts (1–5)</span><input type="number" min="1" max="5" className="w-full rounded-md border bg-background p-2" value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={inboundEnabled} onChange={e => setInboundEnabled(e.target.checked)} /> Inbound enabled</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={outboundEnabled} onChange={e => setOutboundEnabled(e.target.checked)} /> Outbound enabled</label>
      </div>
      <div className="mt-4"><Button disabled={!accountId.trim() || !endpointId.trim() || !propertyId || !secretRef.trim() || (provider === "meta_cloud_api" && !graphVersion.trim()) || !Number.isInteger(Number(maxAttempts)) || Number(maxAttempts) < 1 || Number(maxAttempts) > 5 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save provider mapping"}</Button></div>
      {save.isError && <p className="mt-2 text-sm text-destructive">{String(save.error)}</p>}
      {verify.isError && <p className="mt-2 text-sm text-destructive">{String(verify.error)}</p>}
    </SectionCard>
    <SectionCard title="Active provider mappings">
      <div className="space-y-2">{bindings.data?.map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"><div><div className="font-medium">{row.provider === "meta_cloud_api" ? "Meta WhatsApp" : "Resend Email"} · {row.property_name}</div><div className="text-xs text-muted-foreground">Account {row.external_account_id} · Endpoint {row.external_endpoint_id}</div><div className="mt-1 text-xs text-muted-foreground">Secret ref: {row.credential_secret_ref || "missing"} · Max attempts: {row.max_attempts ?? 3} · Inbound: {row.inbound_enabled ? "on" : "off"} · Outbound: {row.outbound_enabled ? "on" : "off"}</div></div><div className="flex items-center gap-2"><Badge variant={row.verification_status === "verified" ? "default" : "secondary"}>{row.verification_status || "pending"}</Badge><Badge variant={row.enabled ? "default" : "secondary"}>{row.enabled ? "Enabled" : "Disabled"}</Badge><Button size="sm" variant="outline" disabled={verify.isPending || !row.credential_secret_ref} onClick={() => verify.mutate(row.id)}>{verify.isPending ? "Verifying…" : "Verify provider"}</Button></div></div>)}
        {bindings.isLoading && <p className="text-sm text-muted-foreground">Loading mappings…</p>}
        {bindings.isError && <p className="text-sm text-destructive">Unable to load founder provider mappings. The SN-IQ-04.4 migration must be applied in the approved environment.</p>}
        {!bindings.isLoading && !bindings.data?.length && <p className="text-sm text-muted-foreground">No provider mappings configured.</p>}
      </div>
    </SectionCard>
    <SectionCard title="Webhook recovery and rejected events">
      <p className="mb-3 text-sm text-muted-foreground">Founder-only operational evidence. Rejected events retain identifiers and reason codes without storing raw guest payloads. Dead-letter events require investigation before controlled recovery.</p>
      <div className="space-y-2">
        <div className="font-medium text-sm">Dead-letter inbox</div>
        {webhookOps.data?.deadLetters?.map((row: any) => <div key={row.id} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{row.provider} · {row.event_type} · {row.property_name}</span>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">dead letter</Badge>
              {row.recoverable && <Button size="sm" variant="outline" disabled={reprocessWebhook.isPending} onClick={() => reprocessWebhook.mutate(row.id)}>{reprocessWebhook.isPending ? "Reprocessing…" : "Reprocess once"}</Button>}
              {row.recovery_requested_at && <Badge variant="secondary">Recovery used</Badge>}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Attempts {row.attempt_count} · {row.provider_event_id} · {row.received_at}</div>
          {row.last_error && <div className="mt-1 text-xs text-destructive">{row.last_error}</div>}
          {row.recovery_reason && <div className="mt-1 text-xs text-muted-foreground">Recovery reason: {row.recovery_reason}</div>}
        </div>)}
        {!webhookOps.isLoading && !webhookOps.data?.deadLetters?.length && <p className="text-sm text-muted-foreground">No dead-letter events.</p>}
        <div className="mt-4 font-medium text-sm">Rejected provider events</div>
        {webhookOps.data?.rejections?.map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>{row.provider} · {row.event_type} · {row.rejection_code}</span><span className="text-xs text-muted-foreground">{row.received_at}</span>
        </div>)}
        {!webhookOps.isLoading && !webhookOps.data?.rejections?.length && <p className="text-sm text-muted-foreground">No rejected provider events.</p>}
        {reprocessWebhook.isError && <p className="text-sm text-destructive">{reprocessWebhook.error.message}</p>}
        {webhookOps.isError && <p className="text-sm text-destructive">Unable to load webhook recovery evidence.</p>}
      </div>
    </SectionCard>
    <SectionCard title="Credential security">
      <p className="text-sm text-muted-foreground">Access tokens, Meta App Secret, webhook verify token, Resend API key and Svix signing secret are intentionally not stored in property settings or returned to the browser. Provision them through the founder-controlled deployment secret manager. This page manages endpoint-to-property routing only.</p>
    </SectionCard>
  </div>;
}
