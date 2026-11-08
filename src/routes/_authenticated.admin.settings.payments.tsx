import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getFounderAdminStatus } from "@/domains/_platform/founder-admin.functions";
import {
  configureMyGuestPaymentProviderAccount,
  listMyGuestPaymentProviderAccounts,
  configureFounderCommercialPesapalAccount,
  listFounderCommercialAccounts,
  listFounderCommercialProviderAccounts,
  setFounderCommercialProviderStatus,
} from "@/domains/commercial/commercial-provider-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/payments")({
  head: () => ({ meta: [{ title: "Payment Providers — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PaymentProviderSettings,
});

type GuestProvider = "mpesa" | "airtel_money" | "mixx_by_yas" | "halopesa" | "pesapal" | "bank_transfer" | "manual";
const guestProviders: { value: GuestProvider; label: string }[] = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "airtel_money", label: "Airtel Money" },
  { value: "mixx_by_yas", label: "Mixx by Yas" },
  { value: "halopesa", label: "HaloPesa" },
  { value: "pesapal", label: "Pesapal" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "manual", label: "Manual collection" },
];

function PaymentProviderSettings() {
  const founderStatusFn = useServerFn(getFounderAdminStatus);
  const guestListFn = useServerFn(listMyGuestPaymentProviderAccounts);
  const guestConfigureFn = useServerFn(configureMyGuestPaymentProviderAccount);
  const accountsFn = useServerFn(listFounderCommercialAccounts);
  const platformListFn = useServerFn(listFounderCommercialProviderAccounts);
  const platformConfigureFn = useServerFn(configureFounderCommercialPesapalAccount);
  const platformStatusFn = useServerFn(setFounderCommercialProviderStatus);
  const qc = useQueryClient();

  const founder = useQuery({ queryKey: ["payments.founder-status"], queryFn: () => founderStatusFn() });
  const guestAccounts = useQuery({
    queryKey: ["payments.guest-provider-accounts"],
    queryFn: () => guestListFn(),
    enabled: founder.data?.isFounderAdmin !== true,
  });
  const organisations = useQuery({
    queryKey: ["payments.commercial-accounts"],
    queryFn: () => accountsFn(),
    enabled: founder.data?.isFounderAdmin === true,
  });
  const platformAccounts = useQuery({
    queryKey: ["payments.platform-provider-accounts"],
    queryFn: () => platformListFn(),
    enabled: founder.data?.isFounderAdmin === true,
  });

  const [guestProvider, setGuestProvider] = useState<GuestProvider>("mpesa");
  const [guestAccountRef, setGuestAccountRef] = useState("");
  const [guestSecretJson, setGuestSecretJson] = useState("");
  const [guestCurrencies, setGuestCurrencies] = useState<("TZS" | "USD")[]>(["TZS"]);
  const [organisationId, setOrganisationId] = useState("");
  const [platformAccountRef, setPlatformAccountRef] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [ipnId, setIpnId] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [platformCurrencies, setPlatformCurrencies] = useState<("TZS" | "USD")[]>(["TZS"]);

  const saveGuest = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try { parsed = JSON.parse(guestSecretJson); } catch { throw new Error("Credentials must be valid JSON."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
        || Object.values(parsed).some(value => typeof value !== "string" || !value.trim())) {
        throw new Error("Credentials must be a JSON object containing non-empty string values.");
      }
      return guestConfigureFn({ data: {
        provider: guestProvider, providerAccountRef: guestAccountRef,
        supportedCurrencies: guestCurrencies, credentials: parsed as Record<string, string>,
      } });
    },
    onSuccess: () => {
      setGuestAccountRef(""); setGuestSecretJson("");
      qc.invalidateQueries({ queryKey: ["payments.guest-provider-accounts"] });
    },
  });

  const savePlatform = useMutation({
    mutationFn: () => platformConfigureFn({ data: {
      organisationId, providerAccountRef: platformAccountRef, supportedCurrencies: platformCurrencies,
      consumerKey, consumerSecret, environment, ipnId,
    } }),
    onSuccess: () => {
      setPlatformAccountRef(""); setConsumerKey(""); setConsumerSecret(""); setIpnId("");
      qc.invalidateQueries({ queryKey: ["payments.platform-provider-accounts"] });
    },
  });

  const changePlatformStatus = useMutation({
    mutationFn: (input: { providerAccountId: string; status: "inactive" | "active" | "suspended" }) =>
      platformStatusFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments.platform-provider-accounts"] }),
  });

  const mobileMoney = ["mpesa", "airtel_money", "mixx_by_yas", "halopesa"].includes(guestProvider);

  return <div className="space-y-6">
    <PageHeader
      title="Payment Providers"
      description="Administrator-managed payment connections. Property guest collections and StayNas subscription collections are configured and governed separately."
    />

    {founder.data?.isFounderAdmin === true ? (
      <SectionCard title="StayNas subscription collections" description="Nolmark founder administration · Used to collect StayNas subscription invoices, not guest booking payments.">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>StayNas organisation</span>
            <select className="w-full rounded-md border bg-background p-2" value={organisationId} onChange={e => setOrganisationId(e.target.value)}>
              <option value="">Select organisation</option>
              {organisations.data?.map((row: {id:string;name:string;slug:string}) => <option key={row.id} value={row.id}>{row.name} · {row.slug}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Pesapal merchant account reference</span>
            <input className="w-full rounded-md border bg-background p-2" value={platformAccountRef} onChange={e => setPlatformAccountRef(e.target.value)} placeholder="Merchant / account reference" />
          </label>
          <label className="space-y-1 text-sm"><span>Consumer key</span><input type="password" autoComplete="off" className="w-full rounded-md border bg-background p-2" value={consumerKey} onChange={e => setConsumerKey(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>Consumer secret</span><input type="password" autoComplete="new-password" className="w-full rounded-md border bg-background p-2" value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>IPN ID</span><input className="w-full rounded-md border bg-background p-2" value={ipnId} onChange={e => setIpnId(e.target.value)} /></label>
          <label className="space-y-1 text-sm"><span>Environment</span>
            <select className="w-full rounded-md border bg-background p-2" value={environment} onChange={e => setEnvironment(e.target.value as "sandbox" | "live")}><option value="sandbox">Sandbox</option><option value="live">Live</option></select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">Currencies</span>
          {(["TZS","USD"] as const).map(currency => <label key={currency} className="flex items-center gap-2"><input type="checkbox" checked={platformCurrencies.includes(currency)} onChange={e => setPlatformCurrencies(old => e.target.checked ? [...old,currency] : old.filter(x => x !== currency))} />{currency}</label>)}
        </div>
        <div className="mt-4"><Button disabled={!organisationId || !platformAccountRef.trim() || !consumerKey.trim() || !consumerSecret.trim() || !ipnId.trim() || !platformCurrencies.length || savePlatform.isPending} onClick={() => savePlatform.mutate()}>{savePlatform.isPending ? "Saving securely…" : "Save Pesapal configuration"}</Button></div>
        {savePlatform.isError && <p className="mt-2 text-sm text-destructive">{String(savePlatform.error)}</p>}
        <div className="mt-5 space-y-2">
          {platformAccounts.data?.map((row: {id:string;organisation_name:string;provider:string;provider_account_ref:string;supported_currencies:string[];status:string}) =>
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div><div className="font-medium">{row.provider} · {row.organisation_name}</div><div className="text-xs text-muted-foreground">{row.provider_account_ref} · {row.supported_currencies.join(", ")}</div></div>
              <div className="flex items-center gap-2"><Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>
                <Button size="sm" variant="outline" disabled={changePlatformStatus.isPending || row.status === "active"} onClick={() => changePlatformStatus.mutate({providerAccountId:row.id,status:"active"})}>Activate</Button>
                <Button size="sm" variant="outline" disabled={changePlatformStatus.isPending || row.status !== "active"} onClick={() => changePlatformStatus.mutate({providerAccountId:row.id,status:"suspended"})}>Suspend</Button>
              </div>
            </div>
          )}
          {platformAccounts.isLoading && <p className="text-sm text-muted-foreground">Loading platform provider accounts…</p>}
          {platformAccounts.isError && <p className="text-sm text-destructive">Unable to load platform provider accounts.</p>}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Provider credentials are submitted over the authenticated server action and stored in Supabase Vault. They are never returned to this screen. Pesapal activation remains separate from guest payment methods.</p>
      </SectionCard>
    ) : (
      <SectionCard title="Property guest payment methods" description="Property administrator settings · These providers are used for guest folios, deposits and booking payments. They do not pay StayNas subscription invoices.">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Provider</span>
            <select className="w-full rounded-md border bg-background p-2" value={guestProvider} onChange={e => { const next=e.target.value as GuestProvider; setGuestProvider(next); setGuestCurrencies(["mpesa","airtel_money","mixx_by_yas","halopesa"].includes(next) ? ["TZS"] : ["TZS"]); }}>
              {guestProviders.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm"><span>Merchant / provider account reference</span><input className="w-full rounded-md border bg-background p-2" value={guestAccountRef} onChange={e => setGuestAccountRef(e.target.value)} /></label>
        </div>
        <label className="mt-3 block space-y-1 text-sm"><span>Provider credentials (JSON)</span>
          <textarea className="min-h-32 w-full rounded-md border bg-background p-2 font-mono text-xs" value={guestSecretJson} onChange={e => setGuestSecretJson(e.target.value)} placeholder={'{"clientId":"…","clientSecret":"…","environment":"sandbox"}'} />
          <span className="text-xs text-muted-foreground">Use the exact credential fields supplied in your provider merchant agreement. Values are stored in Supabase Vault and never displayed again after saving.</span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted-foreground">Currency</span>
          {(["TZS","USD"] as const).map(currency => <label key={currency} className="flex items-center gap-2"><input type="checkbox" checked={guestCurrencies.includes(currency)} disabled={mobileMoney && currency === "USD"} onChange={e => setGuestCurrencies(old => e.target.checked ? [...old,currency] : old.filter(x => x !== currency))} />{currency}</label>)}
        </div>
        <div className="mt-4"><Button disabled={!guestAccountRef.trim() || !guestSecretJson.trim() || !guestCurrencies.length || saveGuest.isPending} onClick={() => saveGuest.mutate()}>{saveGuest.isPending ? "Saving securely…" : "Save property provider"}</Button></div>
        {saveGuest.isError && <p className="mt-2 text-sm text-destructive">{String(saveGuest.error)}</p>}
        <div className="mt-5 space-y-2">
          {guestAccounts.data?.map((row: {id:string;provider:string;provider_account_ref:string;supported_currencies:string[];integration_status:string;status:string}) =>
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div><div className="font-medium">{guestProviders.find(p => p.value === row.provider)?.label ?? row.provider} · {row.provider_account_ref}</div><div className="text-xs text-muted-foreground">{row.supported_currencies.join(", ")}</div></div>
              <div className="flex items-center gap-2"><Badge variant="secondary">{row.integration_status === "adapter_pending" ? "Adapter pending" : row.integration_status}</Badge><Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge></div>
            </div>
          )}
          {guestAccounts.isLoading && <p className="text-sm text-muted-foreground">Loading property payment methods…</p>}
          {guestAccounts.isError && <p className="text-sm text-destructive">Unable to load property payment methods.</p>}
          {!guestAccounts.isLoading && !guestAccounts.data?.length && <p className="text-sm text-muted-foreground">No property payment methods configured.</p>}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Configuration is available now. Activation remains blocked until the provider-specific guest-payment adapter, callback verification and end-to-end settlement tests are certified. This prevents credentials alone from making an unsupported integration appear live.</p>
      </SectionCard>
    )}
  </div>;
}
