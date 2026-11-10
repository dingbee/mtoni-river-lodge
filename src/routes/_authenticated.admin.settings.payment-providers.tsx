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
  setPropertyGuestCheckoutProvider,
  listFounderGuestPaymentProviders,
  saveFounderPropertyPaymentProviderConfig,
  setFounderGuestCheckoutProvider,
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
  const setGuestCheckoutProviderFn = useServerFn(setPropertyGuestCheckoutProvider);
  const founderGuestListFn = useServerFn(listFounderGuestPaymentProviders);
  const saveFounderPropertyFn = useServerFn(saveFounderPropertyPaymentProviderConfig);
  const setFounderGuestCheckoutFn = useServerFn(setFounderGuestCheckoutProvider);
  const founderStatus = useQuery({ queryKey: ["settings.founder-admin-status"], queryFn: () => founderStatusFn() });
  const isFounder = founderStatus.data?.isFounderAdmin === true;
  const [selectedPropertyId, setSelectedPropertyId] = useState(\"\");
  const founderGuestQuery = useQuery({ queryKey: [\"payments.founder-guest-provider-configs\"], queryFn: () => founderGuestListFn(), enabled: founderStatus.isSuccess && isFounder });
  const selectedFounderProperty = founderGuestQuery.data?.find((property) => property.id === selectedPropertyId) ?? founderGuestQuery.data?.[0];
  const platformQuery = useQuery({
    queryKey: ["payments.platform-provider-configs"],
    queryFn: () => platformListFn(),
    enabled: founderStatus.isSuccess && isFounder,
  });
  const propertyQuery = useQuery({
    queryKey: ["payments.property-provider-configs"],
    queryFn: () => propertyListFn(),
    enabled: founderStatus.isSuccess && !isFounder,
  });
  const rows = (isFounder ? selectedFounderProperty?.providers : propertyQuery.data) as ProviderRow[] | undefined;

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
        ? selectedFounderProperty ? saveFounderPropertyFn({ data: { ...common, propertyId: selectedFounderProperty.id } }) : Promise.reject(new Error(\"Select a property first.\"))
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


  const guestCheckoutMutation = useMutation({
    mutationFn: (providerConfigId: string | null) => isFounder
      ? selectedFounderProperty ? setFounderGuestCheckoutFn({ data: { propertyId: selectedFounderProperty.id, providerConfigId } }) : Promise.reject(new Error(\"Select a property first.\"))
      : setGuestCheckoutProviderFn({ data: { providerConfigId } }),
    onSuccess: () => {
      toast.success("Guest checkout settings updated.");
      queryClient.invalidateQueries({ queryKey: ["payments.property-provider-configs"] });
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

  const queryError = isFounder ? founderGuestQuery.error : propertyQuery.error;
  const isLoading = isFounder ? founderGuestQuery.isLoading : propertyQuery.isLoading;

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
            <Button type="submit" disabled={save.isPending || !accountReference.trim() || !currencies.length || (isFounder && !selectedFounderProperty)}>
              {save.isPending ? "Saving securely…" : "Save provider configuration"}
            </Button>
          </div>
        </form>
      </SectionCard>


      {!isFounder && (
        <SectionCard title="Guest checkout controls" description="Select one certified provider account for this property, or leave online payments disabled. Pay at Property remains available as the fallback.">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Online guest payments</p>
                <p className="text-xs text-muted-foreground">
                  {rows?.some((row) => row.status === "active") ? "Enabled — one provider is selected." : "Disabled — guests can pay at the property."}
                </p>
              </div>
              <Button size="sm" variant="outline"
                disabled={guestCheckoutMutation.isPending || !rows?.some((row) => row.status === "active")}
                onClick={() => guestCheckoutMutation.mutate(null)}>
                Disable online payments
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Select checkout provider</p>
              {(rows ?? []).map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{providers.find((item) => item.value === row.provider)?.label ?? row.provider}</p>
                    <p className="text-xs text-muted-foreground">{row.accountReference} · {row.environment.toUpperCase()} · {row.integrationStatus.replaceAll("_", " ")}</p>
                  </div>
                  <Button size="sm" variant={row.status === "active" ? "default" : "outline"}
                    disabled={guestCheckoutMutation.isPending || row.status === "active" || row.integrationStatus !== "ready"}
                    onClick={() => guestCheckoutMutation.mutate(row.id)}>
                    {row.status === "active" ? "Selected" : row.integrationStatus === "ready" ? "Select provider" : "Adapter not certified"}
                  </Button>
                </div>
              ))}
              {!rows?.some((row) => row.integrationStatus === "ready") && (
                <p className="text-xs text-muted-foreground">No certified property guest-payment adapter is available yet. Provider credentials can be prepared above, but checkout activation remains blocked until certification.</p>
              )}
            </div>
          </div>
        </SectionCard>
      )}

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
                <div className="flex flex-wrap items-center gap-2">
                  {row.status === "active" ? (
                    <Button size="sm" variant="outline" disabled={guestCheckoutMutation.isPending} onClick={() => guestCheckoutMutation.mutate(null)}>Disable checkout</Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={guestCheckoutMutation.isPending || row.integrationStatus !== "ready"} onClick={() => guestCheckoutMutation.mutate(row.id)}>
                      {row.integrationStatus === "ready" ? "Select provider" : "Adapter not certified"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
