import { describe, expect, it, vi } from "vitest";
import { runDistributionOutboxBatch } from "./worker";
import { DistributionProviderRegistry } from "./registry";
import type { DistributionProviderAdapter } from "./provider";
import type { ProviderCapabilities } from "./contracts";

const adapter: DistributionProviderAdapter = {
  id: "test-provider",
  discoverCapabilities: vi.fn(),
  validateConnection: vi.fn(),
  pushRates: vi.fn(async () => ({
    accepted: true, providerOperationId: null, providerRequestId: null,
    retryable: false, retryAfterSeconds: null, errorCode: null,
    safeMessage: null, acknowledgedAt: new Date(0).toISOString(),
  })),
};

function registry() {
  const value = new DistributionProviderRegistry();
  value.register(adapter, {
    operations: ["rates.push"] as ("rates.push")[], restrictions: [], supportsOccupancyPricing: false,
    supportsTaxBreakdown: false, supportsFeeBreakdown: false,
    supportsCurrencyConversion: false, reservationDelivery: "none",
    supportsEventVersioning: false, supportsExternalIdempotency: false,
  });
  return value;
}

const capabilities: ProviderCapabilities = {
  operations: ["rates.push"], restrictions: [],
  supportsOccupancyPricing: false, supportsTaxBreakdown: false,
  supportsFeeBreakdown: false, supportsCurrencyConversion: false,
  reservationDelivery: "none", supportsEventVersioning: false,
  supportsExternalIdempotency: false,
};

const item = {
  outboxId: "00000000-0000-4000-8000-000000000001",
  operationId: "00000000-0000-4000-8000-000000000002",
  leaseToken: "00000000-0000-4000-8000-000000000003",
  organisationId: "00000000-0000-4000-8000-000000000004",
  propertyId: "00000000-0000-4000-8000-000000000005",
  connectionId: "00000000-0000-4000-8000-000000000006",
  provider: "test-provider", operation: "rates.push" as const, attempt: 1,
  payload: [{
    roomTypeId: "00000000-0000-4000-8000-000000000007",
    ratePlanId: "00000000-0000-4000-8000-000000000008",
    stayDate: "2026-12-01", amountMinor: 12000, currency: "TZS",
    occupancy: 2, publicationId: "00000000-0000-4000-8000-000000000009",
    publicationNumber: 1,
  }],
};

describe("distribution outbox worker", () => {
  it("dispatches a publication and acknowledges only its current lease", async () => {
    const finish = vi.fn(async () => true);
    const report = await runDistributionOutboxBatch({
      claim: vi.fn(async () => [item]),
      loadContext: vi.fn(async () => ({
        context: {
          tenantId: item.organisationId, propertyId: item.propertyId,
          connectionId: item.connectionId, externalAccountId: "account",
          externalPropertyId: "property", credentialReference: "vault-ref",
          idempotencyKey: "stable-idempotency-key", correlationId: item.operationId,
        },
        capabilities,
      })),
      finish, registry: registry(),
    });
    expect(report).toEqual({ claimed: 1, delivered: 1, retried: 0, deadLettered: 0, leaseLost: 0 });
    expect(finish).toHaveBeenCalledWith({
      outboxId: item.outboxId, leaseToken: item.leaseToken, status: "delivered",
    });
    expect(adapter.pushRates).toHaveBeenCalledTimes(1);
  });

  it("records lease loss instead of claiming delivery", async () => {
    const report = await runDistributionOutboxBatch({
      claim: vi.fn(async () => [item]),
      loadContext: vi.fn(async () => ({
        context: {
          tenantId: item.organisationId, propertyId: item.propertyId,
          connectionId: item.connectionId, externalAccountId: "account",
          externalPropertyId: "property", credentialReference: "vault-ref",
          idempotencyKey: "stable-idempotency-key", correlationId: item.operationId,
        },
        capabilities,
      })),
      finish: vi.fn(async () => false), registry: registry(),
    });
    expect(report.leaseLost).toBe(1);
    expect(report.delivered).toBe(0);
  });
});
