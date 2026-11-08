import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getFounderAdminStatus } from "@/domains/_platform/founder-admin.functions";
import {
  listPlatformPaymentProviderConfigs,
  listPropertyPaymentProviderConfigs,
  savePlatformPaymentProviderConfig,
  savePropertyPaymentProviderConfig,
  setPlatformPaymentProviderStatus,
  setPropertyPaymentProviderStatus,
} from "@/domains/payments/payment-provider-management.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/payment-providers")({
  head: () => ({ meta: [{ title: "Payment Providers — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PaymentProviderSettings,
});

const providers = [
  { value: "pesapal", label: "Pesapal" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "airtel_money", label: "Airtel Money" },
  { value: "mixx_by_yas", label: "Mixx by Yas" },
  { value: "halopesa", label: "HaloPesa" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "manual", label: "Manual payment" },
] as const;

type ProviderRow = {
  id: string;
  scope: "platform_subscription" | "property_guest";
  provider: string;
  accountReference: string;
  environment: "sandbox" | "live";
  supportedCurrencies: string[];
  publicConfiguration: Record<string, unknown>;
  hasCredentials: boolean;
  credentialUpdatedAt: string | null;
  status: "inactive" | "active" | "suspended";
  integrationStatus: "adapter_pending" | "ready" | "blocked";
  createdAt: string;
  updatedAt: string;
};

function PaymentProviderSettings() {
  const queryClient = useQueryClient();
  const founderStatusFn = useServerFn(getFounderAdminStatus);
  const platformListFn = useServerFn(listPlatformPaymentProviderConfigs);
  const propertyListFn = useServerFn(listPropertyPaymentProviderConfigs);
  const savePlatformFn = useServerFn(savePlatformPaymentProviderConfig);
  const savePropertyFn = useServerFn(savePropertyPaymentProviderConfig);
  const setPlatformStatusFn = useServerFn(setPlatformPaymentProviderStatus);
  const setPropertyStatusFn = useServerFn(setPropertyPaymentProviderStatus);
  const founderStatus = useQuery({ queryKey: ["settings.founder-admin-status"], queryFn: () => founderStatusFn() });
  const isFounder = founderStatus.data?.isFounderAdmin === true;
  const platformQuery = useQuery({
    queryKey: ["payments.platform-provider-configs"],
    queryFn: () => platformListFn(),
    enabled: founderStatus.isSuccess && isFounder,
  });
  const propertyQuery = useQuery({
    queryKey: ["payments.property-provider-configs"],
    queryFn: () => propertyListFn({ data: {} }),
    enabled: founderStatus.isSuccess && !isFounder,
  });
  const rows = (isFounder ? platformQuery.data : propertyQuery.data) as ProviderRow[] | undefined;

  const [provider, setProvider] = useState<string>("mpesa");
  const [accountReference, setAccountReference] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [currencies, setCurrencies] = useState<("TZS" | "USD")[]>(["TZS"]);
  const [credentialsJson, setCredentialsJson] = useState("");
  const [publicConfigurationJson, setPublicConfigurationJson] = useState("{}");

  const save = useMutation({
    mutationFn: async () => {
      let publicConfiguration: Record<string, unknown>;
      try {
        publicConfiguration = JSON.parse(publicConfigurationJson) as Record<string, unknown>;
      } catch {
        throw new Error("Public configuration must be valid JSON.");
      }
      if (!publicConfiguration || Array.isArray(publicConfiguration) || typeof publicConfiguration !== "object") {
        throw new Error("Public configuration must be a JSON object.");
      }
      const common = {
        provider: provider as typeof providers[number]["value"],
        accountReference,
        environment,
        supportedCurrencies: currencies,
        publicConfiguration,
        credentialsJson: credentialsJson || undefined,
      };
      return isFounder
        ? savePlatformFn({ data: common })
        : savePropertyFn({ data: common });
    },
    onSuccess: () => {
      toast.success("Provider configuration saved in Supabase Vault. It remains inactive until its adapter is certified.");
      setCredentialsJson("");
      setAccountReference("");
      queryClient.invalidateQueries({ queryKey: [isFounder ? "payments.platform-provider-configs" : "payments.property-provider-configs"] });
    },
    onError: (error: unknown) => toast.error((error as Error).message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { providerConfigId: string; status: "inactive" | "active" | "suspended" }) =>
      isFounder
        ? setPlatformStatusFn({ data: input })
        : setPropertyStatusFn({ data: input }),
    onSuccess: () => {
      toast.success("Provider status updated.");
      queryClient.invalidateQueries({ queryKey: [isFounder ? "payments.platform-provider-configs" : "payments.property-provider-configs"] });
    },
    onError: (error: unknown) => toast.error((error as Error).message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currencies.length) {
      toast.error("Select at least one supported currency.");
      return;
    }
    save.mutate();
  };

  const queryError = isFounder ? platformQuery.error : propertyQuery.error;
  const isLoading = isFounder ? platformQuery.isLoading : propertyQuery.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Provider Administration"
        description={isFounder
          ? "Configure providers used for StayNas platform subscription collections. These are platform-level credentials, separate from property guest-payment accounts."
          : "Configure payment providers for guest payments at the active property. These credentials are isolated from StayNas subscription billing."}
      />

      <SectionCard title={isFounder ? "Platform subscription collections" : "Property guest payments"}>
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">Configuration is separate from activation</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Provider details are encrypted server-side and never returned to this screen. Configurations are saved inactive. A provider cannot be activated until its provider-specific adapter, callback verification and end-to-end certification are complete.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Payment provider</span>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={provider} onChange={(event) => setProvider(event.target.value)}>
                {providers.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Provider account / merchant reference</span>
              <Input required value={accountReference} onChange={(event) => setAccountReference(event.target.value)} placeholder="Merchant or till reference" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Environment</span>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={environment} onChange={(event) => setEnvironment(event.target.value as "sandbox" | "live")}>
                <option value="sandbox">Sandbox / test</option>
                <option value="live">Live</option>
              </select>
            </label>
            <div className="space-y-2 text-sm">
              <span className="font-medium">Supported currencies</span>
              <div className="flex gap-4 pt-1">
                {(["TZS", "USD"] as const).map((currency) => (
                  <label key={currency} className="flex items-center gap-2">
                    <input type="checkbox" checked={currencies.includes(currency)} onChange={(event) => setCurrencies((current) => event.target.checked ? [...current, currency] : current.filter((value) => value !== currency))} />
                    {currency}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Provider credentials (JSON)</span>
            <textarea
              className="min-h-28 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
              value={credentialsJson}
              onChange={(event) => setCredentialsJson(event.target.value)}
              placeholder={'{"consumerKey":"…","consumerSecret":"…"}'}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="block text-xs text-muted-foreground">Enter credentials supplied by the provider. They are stored in Supabase Vault. Only the Vault UUID reference is stored in the provider account; the plaintext is not logged or returned. Leave blank only when updating non-secret settings on an existing configuration.</span>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Non-secret provider settings (JSON)</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
              value={publicConfigurationJson}
              onChange={(event) => setPublicConfigurationJson(event.target.value)}
              spellCheck={false}
            />
            <span className="block text-xs text-muted-foreground">Use for display labels and non-sensitive options only. Credential-like keys are rejected by the server.</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">New or updated configurations are saved as inactive.</p>
            <Button type="submit" disabled={save.isPending || !accountReference.trim() || !currencies.length}>
              {save.isPending ? "Saving securely…" : "Save provider configuration"}
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Configured providers" description="Credentials are never displayed after saving. Activation is withheld until an approved adapter is available.">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading provider configurations…</p>
        ) : queryError ? (
          <p className="text-sm text-destructive">Provider configurations could not be loaded: {(queryError as Error).message}</p>
        ) : !rows?.length ? (
          <p className="text-sm text-muted-foreground">No providers configured for this scope yet.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{providers.find((item) => item.value === row.provider)?.label ?? row.provider}</span>
                    <Badge variant="outline">{row.status}</Badge>
                    <Badge variant="secondary">{row.integrationStatus.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.accountReference} · {row.environment.toUpperCase()} · {row.supportedCurrencies.join(", ")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.hasCredentials ? "Vault credentials saved" : "No credentials saved"}{row.credentialUpdatedAt ? ` · Updated ${new Date(row.credentialUpdatedAt).toLocaleString()}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">\n                  {row.status === "active" ? (\n                    <Button size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ providerConfigId: row.id, status: "suspended" })}>Suspend</Button>\n                  ) : (\n                    <Button size="sm" variant="outline" disabled={statusMutation.isPending || row.integrationStatus !== "ready"} onClick={() => statusMutation.mutate({ providerConfigId: row.id, status: "active" })}>Activate</Button>\n                  )}\n                  {row.status !== "inactive" && <Button size="sm" variant="ghost" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ providerConfigId: row.id, status: "inactive" })}>Set inactive</Button>}\n                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
