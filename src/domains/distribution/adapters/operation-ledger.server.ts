import { createHash } from "node:crypto";
import type { AdapterExecutionContext } from "./contracts";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const forbiddenPayloadKey = /(secret|token|password|authorization|api[_-]?key|client[_-]?secret|guest|customer|travell?er|personal|contact|recipient|first[_-]?name|last[_-]?name|full[_-]?name|email|phone)/i;

function validateSafePayloadString(value: string): void {
  if (value.length > 2048) throw new Error("Distribution payload string exceeds the safe length limit.");
  const sensitiveValuePatterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /^\+?[0-9]{10,15}$/,
    /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/i,
  ];
  if (sensitiveValuePatterns.some((pattern) => pattern.test(value))) {
    throw new Error("Distribution operation payload contains a sensitive value.");
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    validateSafePayloadString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Distribution operation payload contains a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => {
      if (forbiddenPayloadKey.test(key)) {
        throw new Error("Distribution operation payload contains a prohibited sensitive field.");
      }
      return `${JSON.stringify(key)}:${canonicalize(record[key])}`;
    }).join(",")}}`;
  }
  throw new Error("Distribution operation payload must contain JSON-compatible values only.");
}

export function fingerprintDistributionPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

export function validateDistributionOperationEnvelope(
  idempotencyKey: string,
  payload: Record<string, unknown>,
): string {
  if (idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128) {
    throw new Error("Distribution idempotency key must contain 8 to 128 characters.");
  }
  canonicalize(payload);
  return fingerprintDistributionPayload(payload);
}

export type EnqueuedDistributionOperation = Readonly<{
  operationId: string;
  created: boolean;
}>;

export async function enqueueDistributionOperation(
  context: AdapterExecutionContext,
  idempotencyKey: string,
  requestPayload: Record<string, unknown>,
): Promise<EnqueuedDistributionOperation> {
  const fingerprint = validateDistributionOperationEnvelope(idempotencyKey, requestPayload);
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_enqueue_distribution_operation",
    {
      _organisation_id: context.organisationId,
      _property_id: context.propertyId,
      _connection_id: context.connectionId,
      _provider_key: context.providerKey,
      _environment: context.environment,
      _operation: context.operation,
      _capability: context.capability,
      _idempotency_key: idempotencyKey.trim(),
      _request_fingerprint: fingerprint,
      _correlation_id: context.correlationId,
      _request_payload: requestPayload,
    },
  );
  if (error || !Array.isArray(data) || typeof data[0]?.operation_id !== "string") {
    throw new Error("Distribution operation could not be durably enqueued.");
  }
  return Object.freeze({ operationId: data[0].operation_id, created: data[0].created === true });
}

export async function claimDistributionOperation(workerId: string, leaseSeconds = 60) {
  if (!workerId.trim()) throw new Error("Distribution worker identity is required.");
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_claim_distribution_operation",
    { _worker_id: workerId.trim(), _lease_seconds: leaseSeconds },
  );
  if (error) throw new Error("Distribution operation claim failed.");
  return data;
}

export type FinishDistributionOperationInput = Readonly<{
  operationId: string;
  leaseToken: string;
  workerId: string;
  status: "succeeded" | "retryable_failure" | "permanent_failure";
  normalizedErrorCode?: string | null;
  safeSummary?: string | null;
  providerReference?: string | null;
  resultReference?: string | null;
  responseCode?: number | null;
  durationMs?: number | null;
  retryAfterSeconds?: number | null;
}>;

export async function finishDistributionOperation(input: FinishDistributionOperationInput): Promise<void> {
  const { error } = await (supabaseAdmin as any).rpc(
    "staynas_finish_distribution_operation",
    {
      _operation_id: input.operationId,
      _lease_token: input.leaseToken,
      _worker_id: input.workerId,
      _status: input.status,
      _normalized_error_code: input.normalizedErrorCode ?? null,
      _safe_summary: input.safeSummary ?? null,
      _provider_reference: input.providerReference ?? null,
      _result_reference: input.resultReference ?? null,
      _response_code: input.responseCode ?? null,
      _duration_ms: input.durationMs ?? null,
      _retry_after_seconds: input.retryAfterSeconds ?? null,
    },
  );
  if (error) throw new Error("Distribution operation completion was rejected.");
}

export async function receiveDistributionWebhook(input: Readonly<{
  context: AdapterExecutionContext;
  accountGrantId: string;
  externalAccountId: string;
  providerEventId: string;
  eventType: string;
  normalizedEvent: Record<string, unknown>;
  payloadFingerprint: string;
}>): Promise<Readonly<{ inboxId: string; created: boolean }>> {
  // This function accepts only an already verified, normalized event from a
  // provider-specific signature-verification boundary. Raw webhook bodies must
  // never be passed through or persisted here.
  canonicalize(input.normalizedEvent);
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_receive_distribution_webhook",
    {
      _organisation_id: input.context.organisationId,
      _property_id: input.context.propertyId,
      _account_grant_id: input.accountGrantId,
      _external_account_id: input.externalAccountId,
      _provider_key: input.context.providerKey,
      _environment: input.context.environment,
      _provider_event_id: input.providerEventId,
      _event_type: input.eventType,
      _payload_fingerprint: input.payloadFingerprint,
      _normalized_event: input.normalizedEvent,
      _correlation_id: input.context.correlationId,
    },
  );
  if (error || !Array.isArray(data) || typeof data[0]?.inbox_id !== "string") {
    throw new Error("Distribution webhook event could not be durably recorded.");
  }
  return Object.freeze({ inboxId: data[0].inbox_id, created: data[0].created === true });
}
