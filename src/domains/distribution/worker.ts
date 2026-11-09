import type { DistributionOperation } from "./contracts";
import { dispatchDistributionOperation } from "./engine";
import { classifyProviderFailure, calculateRetryDelaySeconds } from "./retry";
import { DistributionProviderError } from "./provider";
import type { DistributionProviderRegistry } from "./registry";

export interface ClaimedDistributionOperation {
  outboxId: string;
  operationId: string;
  leaseToken: string;
  organisationId: string;
  propertyId: string;
  connectionId: string;
  provider: string;
  operation: DistributionOperation;
  attempt: number;
  payload: unknown;
}

export interface DistributionWorkerDependencies {
  claim(limit: number, leaseSeconds: number): Promise<ClaimedDistributionOperation[]>;
  loadContext(item: ClaimedDistributionOperation): Promise<{
    context: import("./provider").ProviderContext;
    capabilities: import("./contracts").ProviderCapabilities;
  }>;
  finish(input: {
    outboxId: string;
    leaseToken: string;
    status: "delivered" | "retry_wait" | "dead_letter";
    nextAttemptAt?: string;
    errorCode?: string;
  }): Promise<boolean>;
  registry: DistributionProviderRegistry;
  now?: () => Date;
  random?: () => number;
}

export interface DistributionWorkerReport {
  claimed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
  leaseLost: number;
}

/** Processes only outbound publication operations. Reservation workflows use the separate inbox worker. */
export async function runDistributionOutboxBatch(
  deps: DistributionWorkerDependencies,
  limit = 10,
): Promise<DistributionWorkerReport> {
  const items = await deps.claim(limit, 120);
  const report: DistributionWorkerReport = {
    claimed: items.length, delivered: 0, retried: 0, deadLettered: 0, leaseLost: 0,
  };

  for (const item of items) {
    try {
      const { context, capabilities } = await deps.loadContext(item);
      const { adapter } = deps.registry.get(item.provider);
      if (item.operation !== "rates.push" && item.operation !== "availability.push" && item.operation !== "restrictions.push") {
        throw new DistributionProviderError("Operation requires a dedicated workflow and cannot run in the publication worker.", "WORKFLOW_NOT_SUPPORTED", false);
      }
      const payload = Array.isArray(item.payload) ? item.payload : [];
      const result = await dispatchDistributionOperation(
        adapter, capabilities, item.operation, context, payload,
      );
      if (!result.result.accepted) {
        throw new DistributionProviderError(
          result.result.safeMessage ?? "Provider rejected the publication operation.",
          result.result.errorCode ?? "PROVIDER_REJECTED",
          result.result.retryable,
          result.result.retryAfterSeconds,
        );
      }
      const saved = await deps.finish({ outboxId: item.outboxId, leaseToken: item.leaseToken, status: "delivered" });
      if (saved) report.delivered += 1;
      else report.leaseLost += 1;
    } catch (error) {
      const providerError = error instanceof DistributionProviderError
        ? error
        : new DistributionProviderError("Distribution worker failed; inspect redacted diagnostics.", "WORKER_FAILURE", true);
      const disposition = classifyProviderFailure({ retryable: providerError.retryable, attempt: item.attempt });
      if (disposition === "dead_letter") {
        const saved = await deps.finish({
          outboxId: item.outboxId, leaseToken: item.leaseToken,
          status: "dead_letter", errorCode: providerError.code,
        });
        if (saved) report.deadLettered += 1;
        else report.leaseLost += 1;
      } else {
        const delay = calculateRetryDelaySeconds(item.attempt, undefined, deps.random?.() ?? 0.5, providerError.retryAfterSeconds);
        const nextAttemptAt = new Date((deps.now?.() ?? new Date()).getTime() + delay * 1000).toISOString();
        const saved = await deps.finish({
          outboxId: item.outboxId, leaseToken: item.leaseToken,
          status: "retry_wait", nextAttemptAt, errorCode: providerError.code,
        });
        if (saved) report.retried += 1;
        else report.leaseLost += 1;
      }
    }
  }
  return report;
}
