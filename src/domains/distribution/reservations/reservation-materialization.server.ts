import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  finishDistributionWebhook,
  type DistributionWebhookLease,
} from "../adapters/webhook-processing.server";
import {
  externalReservationSchema,
  type ExternalReservationEvent,
} from "./reservation-ingestion.contracts";
import { assessReservationMaterializationReadiness } from "./materialization-readiness";
import {
  decryptReservationPayload,
  fingerprintReservationPayload,
  readReservationPayloadKey,
  reservationPayloadAad,
} from "./reservation-payload-crypto.server";

export type ReservationMaterializationRpcResult = Readonly<{
  outcome: "materialized" | "already_materialized" | "manual_reconciliation" | "retryable_failure";
  booking_id: string | null;
  created: boolean;
  reconciliation_code: string | null;
}>;

export function buildReservationMaterializationRpcArgs(
  lease: DistributionWebhookLease,
  event: ExternalReservationEvent,
): Record<string, unknown> {
  if (!lease.id || !lease.lease_token || !lease.lease_owner ||
      !lease.connection_id || !lease.payload_fingerprint) {
    throw new Error("Reservation materialization lease is incomplete.");
  }
  if (!["reservation.created", "reservation.confirmed"].includes(event.eventType) ||
      event.providerKey !== lease.provider_key ||
      event.providerEventId !== lease.provider_event_id ||
      event.eventType !== lease.event_type ||
      event.externalReservationId !== lease.normalized_event.externalReservationId ||
      event.externalListingId !== lease.normalized_event.externalListingId ||
      (event.externalRoomId ?? null) !== (lease.normalized_event.externalRoomId ?? null) ||
      (event.externalRatePlanId ?? null) !== (lease.normalized_event.externalRatePlanId ?? null) ||
      event.providerStatus !== lease.normalized_event.providerStatus ||
      event.arrivalDate !== lease.normalized_event.arrivalDate ||
      event.departureDate !== lease.normalized_event.departureDate ||
      event.adults !== lease.normalized_event.adults ||
      event.children !== (lease.normalized_event.children ?? 0)) {
    throw new Error("Decrypted reservation payload does not match the durable inbox envelope.");
  }
  if (fingerprintReservationPayload(event) !== lease.payload_fingerprint) {
    throw new Error("Decrypted reservation payload fingerprint does not match the inbox.");
  }

  const below6 = event.childrenBelow6 ?? (event.children === 0 ? 0 : undefined);
  const plus7 = event.children7Plus ?? (event.children === 0 ? 0 : undefined);
  if (below6 === undefined || plus7 === undefined || below6 + plus7 !== event.children) {
    throw new Error("Child age bands are required for deterministic published-plan pricing.");
  }
  const guestName = [event.guest.firstName, event.guest.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  return Object.freeze({
    _inbox_id: lease.id,
    _lease_token: lease.lease_token,
    _worker_id: lease.lease_owner,
    _payload_fingerprint: lease.payload_fingerprint,
    _external_reservation_id: event.externalReservationId,
    _arrival_date: event.arrivalDate,
    _departure_date: event.departureDate,
    _adults: event.adults,
    _children: event.children,
    _children_below_6: below6,
    _children_7_plus: plus7,
    _guest_name: guestName,
    _guest_email: event.guest.email ?? "",
    _guest_phone: event.guest.phone ?? null,
    _country: event.guest.country ?? null,
    _special_requests: null,
  });
}

function parseClaimedLease(row: unknown, workerId: string): DistributionWebhookLease {
  if (!row || typeof row !== "object") {
    throw new Error("Reservation materialization claim returned an invalid lease.");
  }
  const lease = row as Record<string, unknown>;
  if (typeof lease.id !== "string" || typeof lease.lease_token !== "string" ||
      lease.processing_status !== "processing" || lease.lease_owner !== workerId ||
      typeof lease.lease_expires_at !== "string" ||
      typeof lease.payload_fingerprint !== "string" ||
      typeof lease.provider_key !== "string" ||
      typeof lease.external_account_id !== "string" ||
      typeof lease.provider_event_id !== "string" ||
      typeof lease.connection_id !== "string" ||
      typeof lease.normalized_event !== "object" || lease.normalized_event === null ||
      Array.isArray(lease.normalized_event)) {
    throw new Error("Reservation materialization claim returned an invalid lease.");
  }
  return Object.freeze(lease as unknown as DistributionWebhookLease);
}

export async function claimDistributionReservationMaterialization(
  workerId: string,
  leaseSeconds = 60,
): Promise<DistributionWebhookLease | null> {
  const normalizedWorkerId = workerId.trim();
  if (!normalizedWorkerId || normalizedWorkerId.length > 128 ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300) {
    throw new Error("Reservation materialization worker lease is invalid.");
  }
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_claim_distribution_reservation_materialization",
    { _worker_id: normalizedWorkerId, _lease_seconds: leaseSeconds },
  );
  if (error) throw new Error("Reservation materialization claim failed.");
  if (!Array.isArray(data) || data.length === 0) return null;
  return parseClaimedLease(data[0], normalizedWorkerId);
}

async function loadDecryptedReservationEvent(
  lease: DistributionWebhookLease,
): Promise<ExternalReservationEvent> {
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_distribution_reservation_payloads")
    .select("payload_fingerprint,ciphertext,nonce,auth_tag,key_version")
    .eq("inbox_id", lease.id)
    .maybeSingle();
  if (error || !data) throw new Error("Encrypted reservation payload is unavailable.");
  if (data.payload_fingerprint !== lease.payload_fingerprint) {
    throw new Error("Encrypted reservation payload fingerprint mismatch.");
  }
  const decrypted = decryptReservationPayload<unknown>(
    {
      ciphertext: String(data.ciphertext),
      nonce: String(data.nonce),
      authTag: String(data.auth_tag),
      keyVersion: String(data.key_version),
      payloadFingerprint: String(data.payload_fingerprint),
    },
    readReservationPayloadKey(String(data.key_version)),
    reservationPayloadAad(lease.provider_key, lease.external_account_id, lease.provider_event_id),
  );
  const event = externalReservationSchema.parse(decrypted);
  if (fingerprintReservationPayload(event) !== lease.payload_fingerprint) {
    throw new Error("Decrypted reservation payload fingerprint does not match the inbox.");
  }
  return event;
}

export async function materializeClaimedDistributionReservation(
  lease: DistributionWebhookLease,
): Promise<ReservationMaterializationRpcResult> {
  const event = await loadDecryptedReservationEvent(lease);
  const readiness = assessReservationMaterializationReadiness(event, {
    propertyResolved: true,
    roomResolved: true,
    ratePlanRequired: false,
    ratePlanResolved: true,
  });
  if (readiness.kind === "manual_reconciliation") {
    const reason = readiness.reasons.includes("child_age_breakdown_missing")
      ? "child_age_breakdown_missing"
      : readiness.reasons.includes("child_age_breakdown_mismatch")
        ? "child_age_breakdown_mismatch"
        : "guest_identity_incomplete";
    return {
      outcome: "manual_reconciliation",
      booking_id: null,
      created: false,
      reconciliation_code: reason,
    };
  }

  const args = buildReservationMaterializationRpcArgs(lease, event);
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_materialize_distribution_reservation",
    args,
  );
  if (error) throw new Error("Canonical reservation materialization failed.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !["materialized", "already_materialized", "manual_reconciliation", "retryable_failure"].includes(row.outcome)) {
    throw new Error("Canonical reservation materialization returned an invalid outcome.");
  }
  return {
    outcome: row.outcome,
    booking_id: typeof row.booking_id === "string" ? row.booking_id : null,
    created: row.created === true,
    reconciliation_code: typeof row.reconciliation_code === "string" ? row.reconciliation_code : null,
  };
}

/** Claims and processes one new/confirmed provider reservation; lifecycle updates remain DC-05.04. */
export async function processNextDistributionReservationMaterialization(
  workerId: string,
  leaseSeconds = 60,
): Promise<ReservationMaterializationRpcResult | null> {
  const normalizedWorkerId = workerId.trim();
  const lease = await claimDistributionReservationMaterialization(normalizedWorkerId, leaseSeconds);
  if (!lease) return null;

  try {
    const result = await materializeClaimedDistributionReservation(lease);
    if (result.outcome === "materialized" || result.outcome === "already_materialized") {
      await finishDistributionWebhook({
        inboxId: lease.id,
        leaseToken: lease.lease_token,
        workerId: normalizedWorkerId,
        status: "processed",
      });
    } else if (result.outcome === "manual_reconciliation") {
      await finishDistributionWebhook({
        inboxId: lease.id,
        leaseToken: lease.lease_token,
        workerId: normalizedWorkerId,
        status: "manual_reconciliation",
        reconciliationCode: result.reconciliation_code ?? "reservation_requires_review",
        safeSummary: "Provider reservation requires operator reconciliation.",
      });
    } else {
      await finishDistributionWebhook({
        inboxId: lease.id,
        leaseToken: lease.lease_token,
        workerId: normalizedWorkerId,
        status: "retryable_failure",
        safeSummary: "Canonical room inventory was unavailable during reservation materialization.",
        retryAfterSeconds: 60,
      });
    }
    return result;
  } catch (error) {
    await finishDistributionWebhook({
      inboxId: lease.id,
      leaseToken: lease.lease_token,
      workerId: normalizedWorkerId,
      status: "retryable_failure",
      safeSummary: "Reservation materialization failed before canonical booking completion.",
      retryAfterSeconds: 60,
    });
    throw error;
  }
}
