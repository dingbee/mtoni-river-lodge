import { describe, expect, it, vi } from "vitest";
import { createChannexAdapter } from "./channex.adapter";
import type { AdapterExecutionContext, CredentialHandle } from "./contracts";

const context: AdapterExecutionContext = {
  organisationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  connectionId: "50000000-0000-4000-8000-000000000005",
  providerKey: "channex",
  externalAccountReference: "channex-account",
  environment: "sandbox",
  operation: "connection.health",
  capability: "connection.health",
  correlationId: "corr-channex-test",
  adapterVersion: "1.0.0",
};
const handle: CredentialHandle = {
  reference: "vault-reference",
  connectionId: context.connectionId,
  environment: "sandbox",
};

function response(status: number, body: unknown, headers = new Headers()): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("Channex adapter foundation", () => {
  it("registers only capabilities implemented by this first read-only milestone", () => {
    const adapter = createChannexAdapter({
      environments: { sandbox: { apiBaseUrl: "https://staging.channex.io/api/v1" } },
      resolveApiKey: async () => "test-api-key",
    });
    expect(adapter.manifest.providerKey).toBe("channex");
    expect(adapter.manifest.capabilities).toEqual(["listing.read", "connection.health"]);
    expect(adapter.manifest.environments).toEqual(["sandbox"]);
  });

  it("validates the connection using an injected, admin-managed endpoint and server-side key", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://staging.channex.io/api/v1/properties/?pagination[limit]=1");
      expect(new Headers(init?.headers).get("user-api-key")).toBe("test-api-key");
      return response(200, { data: [] });
    }) as unknown as typeof fetch;
    const resolveApiKey = vi.fn(async () => "test-api-key");
    const adapter = createChannexAdapter({
      environments: { sandbox: { apiBaseUrl: "https://staging.channex.io/api/v1" } },
      resolveApiKey,
      fetchImpl,
      now: () => 1_800_000_000_000,
    });
    const result = await adapter.healthCheck!(context, handle);
    expect(result.ok).toBe(true);
    expect(resolveApiKey).toHaveBeenCalledWith(context, handle);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects mismatched credential handles before making a provider request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const adapter = createChannexAdapter({
      environments: { sandbox: { apiBaseUrl: "https://staging.channex.io/api/v1" } },
      resolveApiKey: async () => "test-api-key",
      fetchImpl,
    });
    const result = await adapter.healthCheck!(context, { ...handle, connectionId: "other" });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes authentication and rate-limit errors without exposing provider payloads", async () => {
    for (const [status, expectedCode] of [[401, "authentication"], [429, "rate_limited"]] as const) {
      const adapter = createChannexAdapter({
        environments: { sandbox: { apiBaseUrl: "https://staging.channex.io/api/v1" } },
        resolveApiKey: async () => "test-api-key",
        fetchImpl: (async () => response(status, { errors: { title: "secret provider response" } }, new Headers({ "retry-after": "30" }))) as typeof fetch,
      });
      const result = await adapter.healthCheck!(context, handle);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(expectedCode);
        expect(result.error.safeMessage).not.toContain("secret provider response");
      }
    }
  });

  it("rejects non-HTTPS or credential-bearing endpoint configuration", async () => {
    const adapter = createChannexAdapter({
      environments: { sandbox: { apiBaseUrl: "http://localhost:3000" } },
      resolveApiKey: async () => "test-api-key",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    const result = await adapter.healthCheck!(context, handle);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error.code).toBe("provider_unavailable");
  });
});
