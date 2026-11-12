import type {
  AdapterHealth,
  AdapterResult,
  DistributionAdapter,
  AdapterExecutionContext,
  CredentialHandle,
  NormalizedAdapterError,
  AdapterManifest,
} from "./contracts";

export type ChannexEnvironmentConfig = Readonly<{
  /** Admin-managed provider endpoint; never supplied by a tenant/browser request. */
  apiBaseUrl: string;
  /** Exact host allowlist loaded from the platform-managed provider catalogue. */
  allowedHosts: readonly string[];
}>;

export type ChannexAdapterConfig = Readonly<{
  environments: Readonly<Partial<Record<"sandbox" | "live", ChannexEnvironmentConfig>>>;
  resolveApiKey: (context: AdapterExecutionContext, handle: CredentialHandle) => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}>;

type ChannexEnvelope = Readonly<{
  data?: unknown;
  meta?: unknown;
  errors?: unknown;
}>;

class ChannexConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannexConfigurationError";
  }
}

function validateBaseUrl(value: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChannexConfigurationError("Channex endpoint configuration is invalid.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new ChannexConfigurationError("Channex endpoint must be an HTTPS URL without embedded credentials, query or fragment.");
  }
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new ChannexConfigurationError("Channex endpoint host is not in the platform-managed provider allowlist.");
  }
  return new URL(url.toString().replace(/\/+$/, "") + "/");
}

function normalizeFailure(status: number, correlationId: string, retryAfter?: string): NormalizedAdapterError {
  const retrySeconds = retryAfter ? Number(retryAfter) : NaN;
  if (status === 401) return { code: "authentication", retryable: false, safeMessage: "Channex rejected the configured API credential.", correlationId };
  if (status === 403) return { code: "authorization", retryable: false, safeMessage: "The Channex account is not authorised for this operation.", correlationId };
  if (status === 404) return { code: "configuration", retryable: false, safeMessage: "The configured Channex API endpoint or resource was not found.", correlationId };
  if (status === 429) return { code: "rate_limited", retryable: true, retryAfterMs: Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : 60_000, safeMessage: "Channex rate limit reached; retry after the provider cooldown.", correlationId };
  if (status >= 500) return { code: "provider_unavailable", retryable: true, safeMessage: "Channex is temporarily unavailable.", correlationId };
  return { code: "invalid_request", retryable: false, safeMessage: "Channex rejected the connection validation request.", correlationId };
}

/**
 * Read-only Channex adapter foundation. It deliberately implements no ARI writes,
 * booking import, acknowledgement or channel activation until those workflows
 * have their own contracts and end-to-end evidence.
 */
export function createChannexAdapter(config: ChannexAdapterConfig): DistributionAdapter {
  const fetchImpl = config.fetchImpl ?? fetch;
  const manifest: AdapterManifest = {
      providerKey: "channex",
      adapterVersion: "1.0.0",
      contractVersion: "1.0",
      capabilities: ["connection.health"],
      environments: Object.keys(config.environments).filter(
        (environment): environment is "sandbox" | "live" => environment === "sandbox" || environment === "live",
      ),
      authenticationModes: ["api_key"],
      supportsHealthCheck: true,
  };
  return Object.freeze({
    manifest: Object.freeze(manifest),
    async healthCheck(
      context: AdapterExecutionContext,
      handle: CredentialHandle,
    ): Promise<AdapterResult<AdapterHealth>> {
      const startedAt = (config.now ?? Date.now)();
      try {
        if (context.providerKey !== "channex" || handle.connectionId !== context.connectionId ||
            handle.environment !== context.environment || !handle.reference.trim()) {
          return { ok: false, error: { code: "configuration", retryable: false, safeMessage: "The Channex credential handle does not match the authorised connection.", correlationId: context.correlationId } };
        }
        const environmentConfig = config.environments[context.environment];
        if (!environmentConfig) {
          return { ok: false, error: { code: "configuration", retryable: false, safeMessage: "Channex is not configured for this environment.", correlationId: context.correlationId } };
        }
        const baseUrl = validateBaseUrl(environmentConfig.apiBaseUrl, environmentConfig.allowedHosts);
        const apiKey = await config.resolveApiKey(context, handle);
        if (!apiKey || apiKey.length > 65_536) {
          return { ok: false, error: { code: "configuration", retryable: false, safeMessage: "The Channex API credential is unavailable.", correlationId: context.correlationId } };
        }
        const endpoint = new URL("properties/?pagination[limit]=1", baseUrl);
        const response = await fetchImpl(endpoint, {
          method: "GET",
          headers: { "user-api-key": apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Math.max(0, (config.now ?? Date.now)() - startedAt);
        if (!response.ok) {
          return { ok: false, error: normalizeFailure(response.status, context.correlationId, response.headers.get("retry-after") ?? undefined) };
        }
        const payload = await response.json() as ChannexEnvelope;
        if (!payload || typeof payload !== "object" || (!("data" in payload) && !("meta" in payload))) {
          return { ok: false, error: { code: "unknown", retryable: false, safeMessage: "Channex returned an unexpected response during connection validation.", correlationId: context.correlationId } };
        }
        return { ok: true, value: { state: "healthy", checkedAt: new Date((config.now ?? Date.now)()).toISOString(), latencyMs } };
      } catch (error) {
        const isConfigurationError = error instanceof ChannexConfigurationError;
        const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        return {
          ok: false,
          error: {
            code: isConfigurationError ? "configuration" : isTimeout ? "timeout" : "provider_unavailable",
            retryable: !isConfigurationError,
            safeMessage: isConfigurationError ? "The Channex endpoint configuration is invalid or not approved." : isTimeout ? "The Channex connection check timed out." : "The Channex connection check could not be completed.",
            correlationId: context.correlationId,
          },
        };
      }
    },
  });
}
