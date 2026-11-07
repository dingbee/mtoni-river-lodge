import { z } from "zod";

// Server-only persistence facade for SPE-07. Import this module only from
// trusted server handlers/workers. It never returns credential_secret_ref.
const uuid = z.string().uuid();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const jsonObject = z.record(z.string(), z.unknown());

const connectionInput = z.object({
  actorId: uuid,
  organisationId: uuid,
  propertyId: uuid,
  provider: z.string().min(2).max(80),
  externalAccountId: z.string().trim().min(1).max(255),
  externalPropertyId: z.string().trim().min(1).max(255),
  credentialSecretRef: z.string().trim().min(1).max(255),
  capabilities: jsonObject.default({}),
});

const mappingInput = z.object({
  actorId: uuid,
  organisationId: uuid,
  propertyId: uuid,
  connectionId: uuid,
  mappingType: z.enum(["room_type", "rate_plan"]),
  internalId: uuid,
  externalId: z.string().trim().min(1).max(255),
  active: z.boolean().default(true),
});

const enqueueInput = z.object({
  organisationId: uuid,
  propertyId: uuid,
  connectionId: uuid,
  operationType: z.enum([
    "connection.validate", "rates.push", "availability.push", "restrictions.push",
    "reservations.pull", "reservations.receive", "reservations.modify",
    "reservations.cancel", "reconciliation.read",
  ]),
  idempotencyKey: z.string().trim().min(8).max(200),
  requestFingerprint: fingerprint,
  requestPayload: z.union([jsonObject, z.array(z.unknown())]),
  sourceVersion: z.string().max(160).optional(),
  actorId: uuid.optional(),
});

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function adminClient(): Promise<RpcClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as RpcClient;
}

function unwrap<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(`SPE-07 persistence operation failed: ${error.message}`);
  return data;
}

export async function createDistributionConnection(input: z.input<typeof connectionInput>) {
  const value = connectionInput.parse(input);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_create_connection", {
    p_actor_id: value.actorId,
    p_organisation_id: value.organisationId,
    p_property_id: value.propertyId,
    p_provider: value.provider,
    p_external_account_id: value.externalAccountId,
    p_external_property_id: value.externalPropertyId,
    p_credential_secret_ref: value.credentialSecretRef,
    p_capabilities: value.capabilities,
  });
  return unwrap(data as string, error);
}

export async function upsertDistributionMapping(input: z.input<typeof mappingInput>) {
  const value = mappingInput.parse(input);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_upsert_mapping", {
    p_actor_id: value.actorId,
    p_organisation_id: value.organisationId,
    p_property_id: value.propertyId,
    p_connection_id: value.connectionId,
    p_mapping_type: value.mappingType,
    p_internal_id: value.internalId,
    p_external_id: value.externalId,
    p_active: value.active,
  });
  return unwrap(data as string, error);
}

export async function enqueueDistributionOperation(input: z.input<typeof enqueueInput>) {
  const value = enqueueInput.parse(input);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_enqueue_operation", {
    p_organisation_id: value.organisationId,
    p_property_id: value.propertyId,
    p_connection_id: value.connectionId,
    p_operation_type: value.operationType,
    p_idempotency_key: value.idempotencyKey,
    p_request_fingerprint: value.requestFingerprint,
    p_request_payload: value.requestPayload,
    p_source_version: value.sourceVersion ?? null,
    p_created_by: value.actorId ?? null,
  });
  return unwrap(data, error);
}

export async function claimDistributionOutbox(limit = 25, leaseSeconds = 120) {
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_claim_outbox", {
    p_limit: z.number().int().min(1).max(100).parse(limit),
    p_lease_seconds: z.number().int().min(15).max(900).parse(leaseSeconds),
  });
  return unwrap(data ?? [], error);
}

export async function finishDistributionOutbox(input: {
  outboxId: string; leaseToken: string;
  status: "delivered" | "retry_wait" | "dead_letter";
  nextAttemptAt?: string; errorCode?: string;
}) {
  const value = z.object({
    outboxId: uuid, leaseToken: uuid,
    status: z.enum(["delivered", "retry_wait", "dead_letter"]),
    nextAttemptAt: z.string().datetime().optional(),
    errorCode: z.string().max(120).optional(),
  }).parse(input);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_finish_outbox", {
    p_outbox_id: value.outboxId,
    p_lease_token: value.leaseToken,
    p_status: value.status,
    p_next_attempt_at: value.nextAttemptAt ?? null,
    p_error_code: value.errorCode ?? null,
  });
  return unwrap(Boolean(data), error);
}

export async function receiveDistributionReservationEvent(input: {
  organisationId: string; propertyId: string; connectionId: string;
  providerEventId: string; externalReservationId: string;
  eventType: "created" | "modified" | "cancelled"; eventVersion?: string;
  payloadFingerprint: string; normalizedPayload: Record<string, unknown>;
}) {
  const value = z.object({
    organisationId: uuid, propertyId: uuid, connectionId: uuid,
    providerEventId: z.string().trim().min(1).max(255),
    externalReservationId: z.string().trim().min(1).max(255),
    eventType: z.enum(["created", "modified", "cancelled"]),
    eventVersion: z.string().max(160).optional(),
    payloadFingerprint: fingerprint,
    normalizedPayload: jsonObject,
  }).parse(input);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_receive_reservation_event", {
    p_organisation_id: value.organisationId,
    p_property_id: value.propertyId,
    p_connection_id: value.connectionId,
    p_provider_event_id: value.providerEventId,
    p_external_reservation_id: value.externalReservationId,
    p_event_type: value.eventType,
    p_event_version: value.eventVersion ?? null,
    p_payload_fingerprint: value.payloadFingerprint,
    p_normalized_payload: value.normalizedPayload,
  });
  return unwrap(data, error);
}

export async function claimDistributionReservationInbox(limit = 25, leaseSeconds = 120) {
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_claim_reservation_inbox", {
    p_limit: z.number().int().min(1).max(100).parse(limit),
    p_lease_seconds: z.number().int().min(15).max(900).parse(leaseSeconds),
  });
  return unwrap(data ?? [], error);
}

export async function finishDistributionReservationInbox(input: {
  inboxId: string; leaseToken: string;
  status: "applied" | "duplicate" | "stale" | "manual_review" | "failed";
  bookingId?: string; errorCode?: string; safeErrorMessage?: string; retryAt?: string;
}) {
  const value = z.object({
    inboxId: uuid, leaseToken: uuid,
    status: z.enum(["applied", "duplicate", "stale", "manual_review", "failed"]),
    bookingId: uuid.optional(), errorCode: z.string().max(120).optional(),
    safeErrorMessage: z.string().max(500).optional(),
    retryAt: z.string().datetime().optional(),
  }).parse(input);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_finish_reservation_inbox", {
    p_inbox_id: value.inboxId,
    p_lease_token: value.leaseToken,
    p_status: value.status,
    p_booking_id: value.bookingId ?? null,
    p_error_code: value.errorCode ?? null,
    p_safe_error_message: value.safeErrorMessage ?? null,
    p_retry_at: value.retryAt ?? null,
  });
  return unwrap(Boolean(data), error);
}


export async function recordDistributionPriceCommitment(inboxId: string) {
  const value = uuid.parse(inboxId);
  const sb = await adminClient();
  const { data, error } = await sb.rpc("staynas_distribution_record_price_commitment", {
    p_inbox_id: value,
  });
  return unwrap(data as string, error);
}
