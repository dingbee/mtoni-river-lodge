import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw, ShieldCheck, Globe, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listFounderDomains, listFounderPropertiesForDomains, registerFounderDomain,
  verifyFounderDomain, revokeFounderDomain,
} from "@/lib/founder-domain-control.functions";

export const Route = createFileRoute("/_authenticated/admin/system/domains")({
  head: () => ({ meta: [{ title: "Domain Control Centre — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: FounderDomainControlPage,
});

function FounderDomainControlPage() {
  const queryClient = useQueryClient();
  const listDomains = useServerFn(listFounderDomains);
  const listProperties = useServerFn(listFounderPropertiesForDomains);
  const register = useServerFn(registerFounderDomain);
  const verify = useServerFn(verifyFounderDomain);
  const revoke = useServerFn(revokeFounderDomain);
  const domains = useQuery({ queryKey: ["founder-domain-control"], queryFn: () => listDomains() });
  const properties = useQuery({ queryKey: ["founder-domain-properties"], queryFn: () => listProperties() });
  const [propertyId, setPropertyId] = useState("");
  const [hostname, setHostname] = useState("");
  const [primary, setPrimary] = useState(true);
  const [challenge, setChallenge] = useState<{ hostname: string; name: string; value: string } | null>(null);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["founder-domain-control"] });
  const registerMutation = useMutation({
    mutationFn: () => register({ data: { propertyId, hostname, primary } }),
    onSuccess: (result) => {
      setChallenge({ hostname: result.hostname, name: result.challengeName, value: result.challengeValue });
      setMessage("Domain registered. Publish the TXT challenge below, then run verification.");
      setErrorMessage("");
      setHostname("");
      refresh();
    },
    onError: (error: Error) => { setErrorMessage(error.message); setMessage(""); },
  });
  const verifyMutation = useMutation({
    mutationFn: (domainId: string) => verify({ data: { domainId } }),
    onSuccess: (result) => { setMessage(result.message); setErrorMessage(""); refresh(); },
    onError: (error: Error) => { setErrorMessage(error.message); setMessage(""); },
  });
  const revokeMutation = useMutation({
    mutationFn: (domainId: string) => revoke({ data: { domainId } }),
    onSuccess: () => { setMessage("Domain verification revoked. Public booking resolution will no longer accept this mapping."); setErrorMessage(""); refresh(); },
    onError: (error: Error) => { setErrorMessage(error.message); setMessage(""); },
  });

  return <div className="space-y-6">
    <PageHeader title="Domain Control Centre" description="Founder-only management of tenant custom domains. DNS verification gates domain activation, not StayNas development." actions={<Button variant="outline" size="sm" onClick={() => { domains.refetch(); properties.refetch(); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>} />
    <SectionCard title="Register a tenant domain" description="Registration creates a unique DNS TXT challenge. It does not activate the hostname or change the property's lifecycle status.">
      {properties.isLoading ? <LoadingState label="Loading properties…" /> : properties.isError ? <EmptyState title="Properties unavailable" description="Founder Admin access is required to load the property registry." /> :
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); registerMutation.mutate(); }}>
        <label className="space-y-1 text-sm"><span className="font-medium">Tenant property</span><select className="w-full rounded-md border bg-background px-3 py-2" required value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Select a property…</option>{(properties.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.status}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span className="font-medium">Custom hostname</span><input className="w-full rounded-md border bg-background px-3 py-2" required placeholder="booking.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Set as property's primary domain</label>
        <div className="md:col-span-2"><Button type="submit" disabled={!propertyId || !hostname.trim() || registerMutation.isPending}>{registerMutation.isPending ? "Registering…" : "Register domain and generate challenge"}</Button></div>
      </form>}
      {challenge && <div className="mt-5 rounded-md border p-4 space-y-3"><div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />DNS ownership challenge · {challenge.hostname}</div><p className="text-sm text-muted-foreground">Create a TXT record at your DNS provider. Keep this value private to the domain owner; verification checks an exact match.</p><div className="grid gap-2 text-sm"><div><div className="text-xs text-muted-foreground">Record name / host</div><code className="break-all">{challenge.name}</code></div><div><div className="text-xs text-muted-foreground">TXT value</div><code className="break-all">{challenge.value}</code></div></div><Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(`TXT ${challenge.name} ${challenge.value}`)}><Copy className="mr-2 h-4 w-4" />Copy DNS instructions</Button></div>}
      {message && <p className="mt-3 flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4" />{message}</p>}
      {errorMessage && <p className="mt-3 flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{errorMessage}</p>}
    </SectionCard>
    <SectionCard title="Registered domains" description="Verification is performed server-side against the DNS TXT challenge. Verified status does not automatically activate a property or enable live payments.">
      {domains.isLoading ? <LoadingState label="Loading registered domains…" /> : domains.isError ? <EmptyState title="Domain registry unavailable" description="This view requires the explicit global Founder Admin role." /> : (domains.data ?? []).length === 0 ? <EmptyState title="No registered domains" description="Register a tenant hostname above to start its verification workflow." /> :
      <div className="space-y-3">{(domains.data ?? []).map((domain: any) => <div key={domain.id} className="rounded-md border p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="font-medium break-all">{domain.hostname}</div><div className="mt-1 text-xs text-muted-foreground">{domain.propertyName} · Property status: {domain.propertyStatus}{domain.primary ? " · Primary domain" : ""}</div><div className="mt-1 text-xs text-muted-foreground">{domain.verifiedAt ? `Verified ${new Date(domain.verifiedAt).toLocaleString()}` : domain.lastCheckedAt ? `Last checked ${new Date(domain.lastCheckedAt).toLocaleString()}` : "Not verified yet"}</div></div><Badge variant={domain.verificationStatus === "verified" ? "secondary" : "outline"}>{domain.verificationStatus}</Badge></div>
        {domain.lastVerificationError && <p className="text-xs text-amber-700">{domain.lastVerificationError}</p>}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={verifyMutation.isPending || domain.verificationStatus === "revoked"} onClick={() => verifyMutation.mutate(domain.id)}><ShieldCheck className="mr-2 h-4 w-4" />Verify DNS</Button><Button size="sm" variant="ghost" disabled={revokeMutation.isPending || domain.verificationStatus === "revoked"} onClick={() => { if (confirm(`Revoke verification for ${domain.hostname}?`)) revokeMutation.mutate(domain.id); }}>Revoke verification</Button></div>
      </div>)}</div>}
    </SectionCard>
    <SectionCard title="Security and activation boundaries"><div className="flex items-start gap-3 text-sm"><Globe className="mt-0.5 h-5 w-5 shrink-0" /><p>Only Founder Admin can manage this registry. A successful DNS challenge confirms control of a hostname; it does not prove Vercel routing is configured, mark a property active, or enable payment providers. Those remain separate release gates.</p></div></SectionCard>
  </div>;
}
