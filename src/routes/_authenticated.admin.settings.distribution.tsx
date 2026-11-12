import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Network, ShieldCheck, PlugZap } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createPropertyDistributionConnection,
  listDistributionProviderCatalogue,
  listPropertyDistributionConnections,
  saveDistributionProviderConfiguration,
  validatePropertyDistributionConnection,
} from "@/domains/distribution/provider-settings.functions";
import {
  rotatePropertyDistributionCredential,
  transitionPropertyDistributionConnection,
} from "@/domains/distribution/connection-lifecycle.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/distribution")({
  head: () => ({
    meta: [
      { title: "Distribution Connections — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DistributionConnectionsPage,
});

type PropertyConnection = {
  id: string;
  externalAccountReference: string;
  adapterVersion: string;
  environment: string;
  lifecycle: string;
  createdAt: string;
};

type Provider = {
  provider_key: string;
  display_name: string;
  description: string;
  adapter_version: string;
  lifecycle: string;
  capabilities: string[];
  environment_config: { sandbox?: { apiBaseUrl?: string; allowedHosts?: string[] } };
};

function DistributionConnectionsPage() {
  const providersFn = useServerFn(listDistributionProviderCatalogue);
  const connectionsFn = useServerFn(listPropertyDistributionConnections);
  const createFn = useServerFn(createPropertyDistributionConnection);
  const validateFn = useServerFn(validatePropertyDistributionConnection);
  const saveConfigFn = useServerFn(saveDistributionProviderConfiguration);
  const rotateFn = useServerFn(rotatePropertyDistributionCredential);
  const transitionFn = useServerFn(transitionPropertyDistributionConnection);
  const queryClient = useQueryClient();

  const providers = useQuery({
    queryKey: ["distribution.provider-catalogue"],
    queryFn: () => providersFn(),
  });
  const connections = useQuery({
    queryKey: ["distribution.property-connections"],
    queryFn: () => connectionsFn(),
  });
  const [accountReference, setAccountReference] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sandboxUrl, setSandboxUrl] = useState("https://staging.channex.io/api/v1");
  const [allowedHost, setAllowedHost] = useState("staging.channex.io");
  const [providerLifecycle, setProviderLifecycle] = useState<"active" | "suspended">("active");
  const [validationMessage, setValidationMessage] = useState("");
  const [rotationKeys, setRotationKeys] = useState<Record<string, string>>({});
  const [lifecycleReason, setLifecycleReason] = useState("");

  const channex = (providers.data?.providers ?? []).find(
    (provider: Provider) => provider.provider_key === "channex",
  ) as Provider | undefined;

  const sandboxConfig = channex?.environment_config?.sandbox;

  useEffect(() => {
    if (sandboxConfig) {
      setSandboxUrl(sandboxConfig.apiBaseUrl ?? "");
      setAllowedHost(sandboxConfig.allowedHosts?.join(", ") ?? "");
      setProviderLifecycle(channex?.lifecycle === "suspended" ? "suspended" : "active");
    }
  }, [sandboxConfig, channex?.lifecycle]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { providerKey: "channex", externalAccountReference: accountReference.trim(), apiKey },
      }),
    onSuccess: async () => {
      setAccountReference("");
      setApiKey("");
      setValidationMessage("Credential stored in Vault. Run the sandbox connection check below.");
      await queryClient.invalidateQueries({ queryKey: ["distribution.property-connections"] });
    },
  });

  const validate = useMutation({
    mutationFn: (connectionId: string) => validateFn({ data: { connectionId } }),
    onSuccess: async (result) => {
      setValidationMessage(
        result.ok
          ? "Channex sandbox connection validated and marked connected."
          : `Connection check failed (${result.code}): ${result.message}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["distribution.property-connections"] });
    },
  });

  const rotate = useMutation({
    mutationFn: ({ connectionId, apiKey }: { connectionId: string; apiKey: string }) =>
      rotateFn({ data: { connectionId, apiKey } }),
    onSuccess: async (_result, variables) => {
      setRotationKeys((current) => ({ ...current, [variables.connectionId]: "" }));
      setValidationMessage(
        "Credential rotated securely in Vault. Connection returned to pending validation; run a new health check.",
      );
      await queryClient.invalidateQueries({ queryKey: ["distribution.property-connections"] });
    },
  });

  const transition = useMutation({
    mutationFn: ({
      connectionId,
      action,
    }: {
      connectionId: string;
      action: "suspend" | "resume" | "revoke";
    }) => transitionFn({ data: { connectionId, action, reason: lifecycleReason.trim() } }),
    onSuccess: async (result) => {
      setValidationMessage(`Connection lifecycle updated: ${result.state}.`);
      await queryClient.invalidateQueries({ queryKey: ["distribution.property-connections"] });
    },
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      saveConfigFn({
        data: {
          providerKey: "channex",
          lifecycle: providerLifecycle,
          sandbox: {
            apiBaseUrl: sandboxUrl.trim(),
            allowedHosts: allowedHost
              .split(",")
              .map((host) => host.trim())
              .filter(Boolean),
          },
        },
      }),
    onSuccess: async () => {
      setValidationMessage("Platform provider configuration saved.");
      await queryClient.invalidateQueries({ queryKey: ["distribution.provider-catalogue"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribution Connections"
        description="Connect a property to a supported channel manager. Provider access, credentials and capabilities are controlled independently."
      />

      <SectionCard
        title="Provider availability"
        description="Platform catalogue controls provider endpoints and allowed capabilities."
      >
        {providers.isLoading && (
          <p className="text-sm text-muted-foreground">Loading provider catalogue…</p>
        )}
        {providers.isError && (
          <p className="text-sm text-destructive">Provider catalogue could not be loaded.</p>
        )}
        {providers.data?.providers.map((provider: Provider) => (
          <div
            key={provider.provider_key}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                <Network className="size-4" />
              </span>
              <div>
                <div className="font-medium">
                  {provider.display_name}{" "}
                  <span className="text-xs text-muted-foreground">v{provider.adapter_version}</span>
                </div>
                <p className="text-xs text-muted-foreground">{provider.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capabilities: {provider.capabilities.join(", ")}
                </p>
              </div>
            </div>
            <Badge variant={provider.lifecycle === "active" ? "default" : "secondary"}>
              {provider.lifecycle}
            </Badge>
          </div>
        ))}
        {!providers.isLoading && !providers.data?.providers.length && (
          <p className="text-sm text-muted-foreground">No providers are currently available.</p>
        )}
      </SectionCard>

      {providers.data?.isPlatformAdmin && (
        <SectionCard
          title="Platform provider configuration"
          description="Founder-only. Endpoint configuration is stored in the platform catalogue; credentials are never stored here."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Channex sandbox API base URL</span>
              <input
                className="w-full rounded-md border bg-background p-2"
                value={sandboxUrl}
                onChange={(event) => setSandboxUrl(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Exact allowed hostname(s)</span>
              <input
                className="w-full rounded-md border bg-background p-2"
                value={allowedHost}
                onChange={(event) => setAllowedHost(event.target.value)}
                placeholder="staging.channex.io"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Provider status</span>
              <select
                className="w-full rounded-md border bg-background p-2"
                value={providerLifecycle}
                onChange={(event) =>
                  setProviderLifecycle(event.target.value as "active" | "suspended")
                }
              >
                <option value="active">Active — sandbox only</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </div>
          <div className="mt-4">
            <Button
              disabled={!sandboxUrl.trim() || !allowedHost.trim() || saveConfig.isPending}
              onClick={() => saveConfig.mutate()}
            >
              {saveConfig.isPending ? "Saving…" : "Save provider configuration"}
            </Button>
          </div>
          {saveConfig.isError && (
            <p className="mt-2 text-sm text-destructive">
              Provider configuration could not be saved.
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="Connect Channex sandbox"
        description="The API key is submitted directly to a server function and stored in Supabase Vault. It is never returned to the browser or written to provider catalogue rows."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Channex account reference</span>
            <input
              className="w-full rounded-md border bg-background p-2"
              value={accountReference}
              onChange={(event) => setAccountReference(event.target.value)}
              placeholder="Your Channex account identifier"
              autoComplete="off"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Channex sandbox API key</span>
            <input
              className="w-full rounded-md border bg-background p-2"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Paste sandbox API key"
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            disabled={
              !channex ||
              channex.lifecycle !== "active" ||
              !accountReference.trim() ||
              !apiKey.trim() ||
              create.isPending
            }
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Saving securely…" : "Save sandbox connection"}
          </Button>
          <Badge variant="outline">Sandbox only</Badge>
        </div>
        {create.isError && (
          <p className="mt-2 text-sm text-destructive">
            Connection could not be created. Check provider availability and the account reference.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Property connections"
        description="Each connection is scoped to the currently selected property and its organisation."
      >
        <div className="space-y-3">
          {connections.data?.map((connection: PropertyConnection) => (
            <div
              key={connection.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="font-medium">Channex · {connection.externalAccountReference}</div>
                <div className="text-xs text-muted-foreground">
                  {connection.environment} · Adapter {connection.adapterVersion} · {connection.id}
                </div>
                <div className="mt-1">
                  <Badge variant={connection.lifecycle === "connected" ? "default" : "secondary"}>
                    {connection.lifecycle}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    validate.isPending ||
                    connection.lifecycle === "revoked" ||
                    connection.lifecycle === "suspended"
                  }
                  onClick={() => {
                    setValidationMessage("");
                    validate.mutate(connection.id);
                  }}
                >
                  <PlugZap className="mr-2 size-4" /> Test connection
                </Button>
                {connection.lifecycle !== "revoked" && (
                  <>
                    <input
                      aria-label="Replacement Channex sandbox API key"
                      type="password"
                      autoComplete="new-password"
                      className="w-48 rounded-md border bg-background p-2 text-xs"
                      placeholder="Rotate sandbox API key"
                      value={rotationKeys[connection.id] ?? ""}
                      onChange={(event) =>
                        setRotationKeys((current) => ({
                          ...current,
                          [connection.id]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !rotationKeys[connection.id]?.trim() ||
                        rotate.isPending ||
                        connection.lifecycle === "suspended"
                      }
                      onClick={() =>
                        rotate.mutate({
                          connectionId: connection.id,
                          apiKey: rotationKeys[connection.id],
                        })
                      }
                    >
                      Rotate key
                    </Button>
                    {connection.lifecycle === "suspended" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!lifecycleReason.trim() || transition.isPending}
                        onClick={() =>
                          transition.mutate({ connectionId: connection.id, action: "resume" })
                        }
                      >
                        Resume
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!lifecycleReason.trim() || transition.isPending}
                        onClick={() =>
                          transition.mutate({ connectionId: connection.id, action: "suspend" })
                        }
                      >
                        Suspend
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!lifecycleReason.trim() || transition.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Revoke this distribution connection permanently? This cannot be undone.",
                          )
                        )
                          transition.mutate({ connectionId: connection.id, action: "revoke" });
                      }}
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {connections.isLoading && (
            <p className="text-sm text-muted-foreground">Loading property connections…</p>
          )}
          {connections.isError && (
            <p className="text-sm text-destructive">
              Unable to load connections for the selected property.
            </p>
          )}
          {!connections.isLoading && !connections.data?.length && (
            <p className="text-sm text-muted-foreground">
              No distribution connections configured for this property.
            </p>
          )}
        </div>
        <label className="mt-3 block max-w-xl space-y-1 text-sm">
          <span>Reason for suspend, resume or revoke</span>
          <input
            className="w-full rounded-md border bg-background p-2"
            value={lifecycleReason}
            onChange={(event) => setLifecycleReason(event.target.value)}
            placeholder="Record the operational reason for this change"
          />
        </label>
        {rotate.isError && (
          <p className="mt-2 text-sm text-destructive">Credential rotation failed.</p>
        )}
        {transition.isError && (
          <p className="mt-2 text-sm text-destructive">Lifecycle transition failed.</p>
        )}
        {validationMessage && (
          <p className="mt-3 text-sm" role="status">
            {validationMessage}
          </p>
        )}
      </SectionCard>

      <SectionCard title="DC-07A capability boundary">
        <div className="flex items-start gap-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            DC-07A supports sandbox connection health validation only. Listing discovery, room and
            rate-plan mapping, availability/rate updates, reservation ingestion, acknowledgement and
            live OTA activation remain disabled and require their own implementation and acceptance.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
