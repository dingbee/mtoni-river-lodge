import { createHash } from "node:crypto";
import {
  distributionAvailabilitySchema,
  distributionRateSchema,
  distributionRestrictionSchema,
  type DistributionOperation,
  type ProviderCapabilities,
} from "./contracts";
import {
  DistributionProviderError,
  type DistributionProviderAdapter,
  type ProviderContext,
  type ProviderResult,
  assertAdapterContract,
} from "./provider";

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function payloadFingerprint(value: unknown): string {
  return createHash("sha256").update(stableValue(value)).digest("hex");
}

export function assertProviderCapability(
  adapter: DistributionProviderAdapter,
  capabilities: ProviderCapabilities,
  operation: DistributionOperation,
): void {
  assertAdapterContract(adapter, capabilities);
  if (!capabilities.operations.includes(operation)) {
    throw new DistributionProviderError(
      `Provider ${adapter.id} does not support ${operation}.`,
      "PROVIDER_CAPABILITY_UNSUPPORTED",
      false,
    );
  }
}

export function validateOutboundPayload(
  operation: "rates.push" | "availability.push" | "restrictions.push",
  payload: unknown[],
): void {
  if (!Array.isArray(payload) || payload.length === 0) throw new Error("Distribution payload must contain at least one item.");
  if (operation === "rates.push") payload.forEach((item) => distributionRateSchema.parse(item));
  if (operation === "availability.push") payload.forEach((item) => distributionAvailabilitySchema.parse(item));
  if (operation === "restrictions.push") payload.forEach((item) => distributionRestrictionSchema.parse(item));
}

export async function dispatchDistributionOperation(
  adapter: DistributionProviderAdapter,
  capabilities: ProviderCapabilities,
  operation: "rates.push" | "availability.push" | "restrictions.push",
  context: ProviderContext,
  payload: unknown[],
): Promise<{ result: ProviderResult; payloadFingerprint: string }> {
  assertProviderCapability(adapter, capabilities, operation);
  validateOutboundPayload(operation, payload);
  if (!context.tenantId || !context.propertyId || !context.connectionId || !context.idempotencyKey) {
    throw new Error("Distribution context is missing its tenant/property scope or idempotency key.");
  }

  const fingerprint = payloadFingerprint(payload);
  let result: ProviderResult;
  try {
    if (operation === "rates.push" && adapter.pushRates) {
      result = await adapter.pushRates(context, payload as Parameters<NonNullable<typeof adapter.pushRates>>[1]);
    } else if (operation === "availability.push" && adapter.pushAvailability) {
      result = await adapter.pushAvailability(context, payload as Parameters<NonNullable<typeof adapter.pushAvailability>>[1]);
    } else if (operation === "restrictions.push" && adapter.pushRestrictions) {
      result = await adapter.pushRestrictions(context, payload as Parameters<NonNullable<typeof adapter.pushRestrictions>>[1]);
    } else {
      throw new DistributionProviderError("Provider method is unavailable.", "PROVIDER_METHOD_UNAVAILABLE", false);
    }
  } catch (error) {
    if (error instanceof DistributionProviderError) throw error;
    throw new DistributionProviderError(
      "Provider request failed; inspect the redacted operation diagnostic.",
      "PROVIDER_REQUEST_FAILED",
      true,
    );
  }
  return { result, payloadFingerprint: fingerprint };
}
