import type { AdapterExecutionContext } from "./contracts";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const forbiddenKey = /(secret|token|password|authorization|api[_-]?key|client[_-]?secret|guest|customer|travell?er|personal|contact|recipient|first[_-]?name|last[_-]?name|full[_-]?name|email|phone)/i;\n\nfunction validateSafePayloadString(value: string): void {\n  if (value.length > 2048) throw new Error("Distribution outbox string exceeds the safe length limit.");\n  const sensitiveValuePatterns = [\n    /\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b/i,\n    /^\\+?[0-9]{10,15}$/,\n    /\\bBearer\\s+[A-Za-z0-9._~-]{12,}\\b/i,\n    /\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b/,\n    /\\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\\b/i,\n  ];\n  if (sensitiveValuePatterns.some((pattern) => pattern.test(value))) {\n    throw new Error("Distribution outbox payload contains a sensitive value.");\n  }\n}

export function validateDistributionOutboxPayload(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Distribution outbox payload must be a JSON object.");
  }
  const visit = (item: unknown): void => {
    if (item === null || typeof item === "boolean") return;\n    if (typeof item === "string") {\n      validateSafePayloadString(item);\n      return;\n    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new Error("Distribution outbox payload contains a non-finite number.");
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        if (forbiddenKey.test(key)) {
          throw new Error("Distribution outbox payload contains a prohibited sensitive field.");
        }
        visit(child);
      }
      return;
    }
    throw new Error("Distribution outbox payload must contain JSON-compatible values only.");
  };
  visit(value);
}

export type DistributionOutboxEvent = Readonly<{
  id: string;
  organisation_id: string;
  property_id: string;
  connection_id: string;
  operation_id: string | null;
  event_key: string;
  event_type: string;
  event_payload: Record<string, unknown>;
  correlation_id: string;
  status: "pending" | "publishing" | "published" | "retryable_failure" | "permanent_failure";
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
  lease_owner: string;
}>;

export async function enqueueDistributionOutboxEvent(
  context: AdapterExecutionContext,
  eventKey: string,
  eventType: string,
  eventPayload: Record<string, unknown>,
  operationId: string | null = null,
): Promise<Readonly<{ outboxId: string; created: boolean }>> {
  if (eventKey.trim().length < 8 || eventKey.trim().length > 160) {
    throw new Error("Distribution outbox event key must contain 8 to 160 characters.");
  }
  if (eventType.trim().length < 1 || eventType.trim().length > 96) {
    throw new Error("Distribution outbox event type must contain 1 to 96 characters.");
  }
  validateDistributionOutboxPayload(eventPayload);
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_enqueue_distribution_outbox",
    {
      _organisation_id: context.organisationId,
      _property_id: context.propertyId,
      _connection_id: context.connectionId,
      _operation_id: operationId,
      _event_key: eventKey.trim(),
      _event_type: eventType.trim(),
      _event_payload: eventPayload,
      _correlation_id: context.correlationId,
    },
  );
  if (error || !Array.isArray(data) || typeof data[0]?.outbox_id !== "string") {
    throw new Error("Distribution outbox event could not be durably enqueued.");
  }
  return Object.freeze({ outboxId: data[0].outbox_id, created: data[0].created === true });
}

export async function claimDistributionOutboxEvent(workerId: string, leaseSeconds = 60): Promise<DistributionOutboxEvent | null> {
  if (!workerId.trim()) throw new Error("Distribution outbox worker identity is required.");
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300) {
    throw new Error("Distribution outbox lease must be between 5 and 300 seconds.");
  }
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_claim_distribution_outbox",
    { _worker_id: workerId.trim(), _lease_seconds: leaseSeconds },
  );
  if (error) throw new Error("Distribution outbox claim failed.");
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] as DistributionOutboxEvent;
}

export async function finishDistributionOutboxEvent(input: Readonly<{
  outboxId: string;
  leaseToken: string;
  workerId: string;
  status: "published" | "retryable_failure" | "permanent_failure";
  safeSummary?: string | null;
  retryAfterSeconds?: number | null;
}>): Promise<void> {
  const { error } = await (supabaseAdmin as any).rpc(
    "staynas_finish_distribution_outbox",
    {
      _outbox_id: input.outboxId,
      _lease_token: input.leaseToken,
      _worker_id: input.workerId,
      _status: input.status,
      _safe_summary: input.safeSummary ?? null,
      _retry_after_seconds: input.retryAfterSeconds ?? null,
    },
  );
  if (error) throw new Error("Distribution outbox completion was rejected.");
}

/**
 * Dispatches one durable outbox event through an injected internal publisher.
 * This is a queue boundary only: it does not invoke a distribution provider or
 * perform booking, inventory, availability or reservation synchronization.
 */
export async function publishNextDistributionOutboxEvent(
  workerId: string,
  publish: (event: DistributionOutboxEvent) => Promise<void>,
  leaseSeconds = 60,
): Promise<Readonly<{ claimed: boolean; published: boolean }>> {
  const event = await claimDistributionOutboxEvent(workerId, leaseSeconds);
  if (!event) return Object.freeze({ claimed: false, published: false });

  try {
    await publish(event);
  } catch {
    await finishDistributionOutboxEvent({
      outboxId: event.id,
      leaseToken: event.lease_token,
      workerId,
      status: "retryable_failure",
      safeSummary: "Internal outbox event publication failed.",
      retryAfterSeconds: 60,
    });
    return Object.freeze({ claimed: true, published: false });
  }

  await finishDistributionOutboxEvent({
    outboxId: event.id,
    leaseToken: event.lease_token,
    workerId,
    status: "published",
  });
  return Object.freeze({ claimed: true, published: true });
}
