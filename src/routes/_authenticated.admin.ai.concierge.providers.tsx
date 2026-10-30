import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listFounderProviderBindings, listFounderProviderProperties, saveFounderProviderBinding } from "@/domains/ai/concierge/founder-provider-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/providers")({
  head: () => ({ meta: [{ title: "Provider Routing — Founder Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: FounderProviderSettings,
});

function FounderProviderSettings() {
  const bindingsFn = useServerFn(listFounderProviderBindings);
  const propertiesFn = useServerFn(listFounderProviderProperties);
  const saveFn = useServerFn(saveFounderProviderBinding);
  const qc = useQueryClient();
  const bindings = useQuery({ queryKey: ["founder.provider-bindings"], queryFn: () => bindingsFn() });
  const properties = useQuery({ queryKey: ["founder.provider-properties"], queryFn: () => propertiesFn() });
  const [provider, setProvider] = useState<"meta_cloud_api" | "resend">("meta_cloud_api");
  const [accountId, setAccountId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { provider, external_account_id: accountId, external_endpoint_id: endpointId, property_id: propertyId, enabled } }),
    onSuccess: () => { setAccountId(""); setEndpointId(""); qc.invalidateQueries({ queryKey: ["founder.provider-bindings"] }); },
  });
  return <div className="space-y-6">
    <PageHeader title="Provider Routing" description="Founder Admin · Nolmark CDMA. Map verified provider endpoints to one StayNas property." />
    <SectionCard title="Add or update provider mapping">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>Provider</span><select className="w-full rounded-md border bg-background p-2" value={provider} onChange={e => setProvider(e.target.value as typeof provider)}><option value="meta_cloud_api">Meta WhatsApp Cloud API</option><option value="resend">Resend Email</option></select></label>
        <label className="space-y-1 text-sm"><span>StayNas property</span><select className="w-full rounded-md border bg-background p-2" value={propertyId} onChange={e => setPropertyId(e.target.value)}><option value="">Select property</option>{properties.data?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Provider account ID</span><input className="w-full rounded-md border bg-background p-2" value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="Meta business account / Resend account identifier" /></label>
        <label className="space-y-1 text-sm"><span>Endpoint ID</span><input className="w-full rounded-md border bg-background p-2" value={endpointId} onChange={e => setEndpointId(e.target.value)} placeholder={provider === "meta_cloud_api" ? "WhatsApp phone number ID" : "Verified sender email identity"} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable inbound event routing for this mapping</label>
      <div className="mt-4"><Button disabled={!accountId.trim() || !endpointId.trim() || !propertyId || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save provider mapping"}</Button></div>
      {save.isError && <p className="mt-2 text-sm text-destructive">{String(save.error)}</p>}
    </SectionCard>
    <SectionCard title="Active provider mappings">
      <div className="space-y-2">{bindings.data?.map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"><div><div className="font-medium">{row.provider === "meta_cloud_api" ? "Meta WhatsApp" : "Resend Email"} · {row.property_name}</div><div className="text-xs text-muted-foreground">Account {row.external_account_id} · Endpoint {row.external_endpoint_id}</div></div><Badge variant={row.enabled ? "default" : "secondary"}>{row.enabled ? "Enabled" : "Disabled"}</Badge></div>)}
        {bindings.isLoading && <p className="text-sm text-muted-foreground">Loading mappings…</p>}
        {bindings.isError && <p className="text-sm text-destructive">Unable to load founder provider mappings. The SN-IQ-04.4 migration must be applied in the approved environment.</p>}
        {!bindings.isLoading && !bindings.data?.length && <p className="text-sm text-muted-foreground">No provider mappings configured.</p>}
      </div>
    </SectionCard>
    <SectionCard title="Credential security">
      <p className="text-sm text-muted-foreground">Access tokens, Meta App Secret, webhook verify token, Resend API key and Svix signing secret are intentionally not stored in property settings or returned to the browser. Provision them through the founder-controlled deployment secret manager. This page manages endpoint-to-property routing only.</p>
    </SectionCard>
  </div>;
}
