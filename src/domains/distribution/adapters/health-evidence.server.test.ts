import { describe, expect, it } from "vitest";
import type { AdapterExecutionContext, AdapterHealth } from "./contracts";
import { buildDistributionHealthEvidenceArgs } from "./health-evidence.server";

const context: AdapterExecutionContext = Object.freeze({
  organisationId: "10000000-0000-4000-8000-000000000001",
  propertyId: "20000000-0000-4000-8000-000000000002",
  connectionId: "50000000-0000-4000-8000-000000000005",
  providerKey: "sample_ota",
  externalAccountReference: "acct-demo-17",
  environment: "sandbox",
  operation: "health.probe",
  capability: "connection.health",
  correlationId: "corr-dc04-health-1",
  adapterVersion: "1.2.0",
});

describe("DC-04.11 durable health evidence contract", () => {
  it("maps only normalized, scoped evidence to the server RPC envelope", () => {
    const health: AdapterHealth = {
      state: "degraded",
      checkedAt: "2026-11-05T09:00:00.000Z",
      latencyMs: 180,
      error: {
        code: "rate_limited",
        retryable: true,
        retryAfterMs: 1200,
        safeMessage: "The provider rate limit was reached.",
        providerCode: "RATE_LIMIT",
        correlationId: context.correlationId,
      },
    };
    const args = buildDistributionHealthEvidenceArgs(context, health, "health-worker-01", "valid");
    expect(args).toMatchObject({
      _organisation_id: context.organisationId,
      _property_id: context.propertyId,
      _connection_id: context.connectionId,
      _capability: "connection.health",
      _health_state: "degraded",
      _latency_ms: 180,
      _normalized_error_code: "rate_limited",
      _safe_message: "The provider rate limit was reached. Retry after the indicated delay.",
      _provider_code: "RATE_LIMIT",
      _credential_state: "valid",
      _worker_id: "health-worker-01",
    });
    expect(JSON.stringify(args)).not.toContain("retryAfterMs");
    expect(Object.isFrozen(args)).toBe(true);
  });

  it("does not accept raw provider diagnostics or secret-shaped fields", () => {
    const health = {
      state: "degraded",
      checkedAt: "2026-11-05T09:00:00.000Z",
      error: {
        code: "unknown",
        retryable: false,
        safeMessage: "safe",
        providerCode: "AUTH_DENIED",
        correlationId: context.correlationId,
        rawBody: "access_token=secret",
      },
    } as unknown as AdapterHealth;
    const args = buildDistributionHealthEvidenceArgs(context, health, "worker");
    expect(JSON.stringify(args)).not.toContain("access_token");
    expect(JSON.stringify(args)).not.toContain("secret");
  });

  it("rejects malformed timestamps, latency and incomplete worker identity", () => {
    expect(() =>
      buildDistributionHealthEvidenceArgs(
        context,
        { state: "healthy", checkedAt: "invalid" },
        "worker",
      ),
    ).toThrow(/timestamp/);
    expect(() =>
      buildDistributionHealthEvidenceArgs(
        context,
        { state: "healthy", checkedAt: "2026-11-05T09:00:00Z", latencyMs: 30_001 },
        "worker",
      ),
    ).toThrow(/latency/);
    expect(() =>
      buildDistributionHealthEvidenceArgs(
        context,
        { state: "healthy", checkedAt: "2026-11-05T09:00:00Z" },
        " ",
      ),
    ).toThrow(/incomplete/);
  });

  it("rejects mismatched error correlation identifiers", () => {
    expect(() =>
      buildDistributionHealthEvidenceArgs(
        context,
        {
          state: "degraded",
          checkedAt: "2026-11-05T09:00:00Z",
          error: {
            code: "unknown",
            retryable: false,
            safeMessage: "raw",
            correlationId: "other-correlation",
          },
        },
        "worker",
      ),
    ).toThrow(/correlation/);
  });

  it("rejects an error attached to a healthy assessment", () => {
    expect(() =>
      buildDistributionHealthEvidenceArgs(
        context,
        {
          state: "healthy",
          checkedAt: "2026-11-05T09:00:00Z",
          error: {
            code: "unknown",
            retryable: false,
            safeMessage: "unsafe state",
            correlationId: context.correlationId,
          },
        },
        "worker",
      ),
    ).toThrow(/cannot contain an error/);
  });
});
