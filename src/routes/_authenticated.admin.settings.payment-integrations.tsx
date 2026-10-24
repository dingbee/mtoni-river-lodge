import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { listPropertyPaymentIntegrations, savePropertyPaymentIntegration } from "@/lib/property-payment-integrations.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/payment-integrations")({
  head: () => ({ meta: [{ title: "Payment Integrations — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PropertyPaymentIntegrationsPage,
});

function PropertyPaymentIntegrationsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPropertyPaymentIntegrations);
  const saveFn = useServerFn(savePropertyPaymentIntegration);
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [displayName, setDisplayName] = useState("Pesapal");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [ipnId, setIpnId] = useState("");
  const [currency, setCurrency] = useState("TZS");
  const integrations = useQuery({ queryKey: ["property-payment-integrations"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: () => saveFn({ data: { provider: "pesapal", environment, displayName, consumerKey, consumerSecret, ipnId, supportedCurrencies: currency.split(",").map(x => x.trim().toUpperCase()).filter(Boolean), enabled: false } }),
    onSuccess: () => {
      setConsumerKey(""); setConsumerSecret(""); setIpnId("");
      toast.success("Credentials saved securely. Integration remains disabled until verification is completed.");
      qc.invalidateQueries({ queryKey: ["property-payment-integrations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return <div className="space-y-6">
    <PageHeader title="Payment Integrations" description="Configure payment credentials for the currently selected property. Credentials are stored server-side and never shown again." />
    <SectionCard title="Configured integrations" description="Credentials are never returned by the list endpoint. A pending status is not provider certification.">
      {integrations.isLoading ? <p className="text-sm text-muted-foreground">Loading integrations…</p> : integrations.isError ? <p className="text-sm text-destructive">Unable to load integrations. Verify owner/manager access for this property.</p> : (integrations.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No payment integrations configured for this property.</p> : <div className="space-y-3">
        {(integrations.data ?? []).map((item: any) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div><div className="font-medium">{item.display_name ?? item.provider}</div><div className="text-xs text-muted-foreground">{item.environment} · {item.credentials_configured ? "Credentials stored" : "Credentials missing"} · {item.enabled ? "Enabled" : "Disabled"}</div></div>
          <Badge variant={item.verification_status === "verified" ? "secondary" : "outline"}>{item.verification_status ?? "not_configured"}</Badge>
        </div>)}
      </div>}
    </SectionCard>
    <SectionCard title="Configure Pesapal" description="Use credentials issued to this property. Saving credentials does not run a live transaction or certify the provider. The integration remains disabled until verification is implemented and passed.">
      <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1 text-sm">Display name<input className="rounded-md border bg-background px-3 py-2" value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={80} /></label>
        <label className="grid gap-1 text-sm">Environment<select className="rounded-md border bg-background px-3 py-2" value={environment} onChange={e => setEnvironment(e.target.value as "sandbox" | "live")}><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label>
        <label className="grid gap-1 text-sm">Consumer key<input className="rounded-md border bg-background px-3 py-2" value={consumerKey} onChange={e => setConsumerKey(e.target.value)} autoComplete="off" required /></label>
        <label className="grid gap-1 text-sm">Consumer secret<input className="rounded-md border bg-background px-3 py-2" type="password" value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} autoComplete="new-password" required /></label>
        <label className="grid gap-1 text-sm">IPN ID (if assigned)<input className="rounded-md border bg-background px-3 py-2" value={ipnId} onChange={e => setIpnId(e.target.value)} autoComplete="off" /></label>
        <label className="grid gap-1 text-sm">Supported currencies (comma-separated)<input className="rounded-md border bg-background px-3 py-2" value={currency} onChange={e => setCurrency(e.target.value)} required placeholder="TZS, USD" /></label>
          <div className="md:col-span-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving securely…" : "Save integration"}</Button></div>
      </form>
    </SectionCard>
  </div>;
}
