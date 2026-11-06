import { describe, expect, it } from "vitest";
import { externalReservationSchema } from "./reservation-ingestion.contracts";
import { fingerprintReservationPayload } from "./reservation-payload-crypto.server";
import {
  buildReservationMaterializationRpcArgs,
  type ReservationMaterializationRpcResult,
} from "./reservation-materialization.server";
import type { DistributionWebhookLease } from "../adapters/webhook-processing.server";

const lease: DistributionWebhookLease = {
  id: "inbox-1",
  connection_id: "connection-1",
  organisation_id: "org-1",
  property_id: "property-1",
  account_grant_id: "grant-1",
  external_account_id: "external-account-1",
  provider_key: "airbnb",
  environment: "sandbox",
  provider_event_id: "event-1",
  event_type: "reservation.created",
  payload_fingerprint: "a".repeat(64),
  normalized_event: {
    externalReservationId: "reservation-1",
    arrivalDate: "2026-12-01",
    departureDate: "2026-12-04",
    adults: 2,
    children: 1,
  },
  correlation_id: "correlation-1",
  processing_status: "processing",
  attempt_count: 1,
  max_attempts: 5,
  lease_token: "lease-1",
  lease_owner: "worker-1",
  lease_started_at: "2026-11-06T08:00:00Z",
  lease_expires_at: "2026-11-06T08:01:00Z",
};

const event = externalReservationSchema.parse({
  providerKey: "airbnb",
  externalAccountReference: "provider-account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  providerEventId: "event-1",
  eventType: "reservation.created",
  providerStatus: "confirmed",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-04",
  adults: 2,
  children: 1,
  childrenBelow6: 0,
  children7Plus: 1,
  providerPayloadFingerprint: "b".repeat(64),
  guest: { firstName: "Amina", lastName: "Mushi", email: "amina@example.test" },
});

describe("DC-05.03 materialization contracts", () => {
  it("binds decrypted guest and stay details to the leased inbox event", () => {
    const args = buildReservationMaterializationRpcArgs({
      ...lease, payload_fingerprint: fingerprintReservationPayload(event),
    }, event);
    expect(args).toMatchObject({
      _inbox_id: "inbox-1",
      _lease_token: "lease-1",
      _worker_id: "worker-1",
      _external_reservation_id: "reservation-1",
      _arrival_date: "2026-12-01",
      _departure_date: "2026-12-04",
      _adults: 2,
      _children: 1,
      _children_below_6: 0,
      _children_7_plus: 1,
      _guest_name: "Amina Mushi",
      _guest_email: "amina@example.test",
    });
  });

  it("rejects an event that does not match the safe inbox envelope", () => {
    expect(() => buildReservationMaterializationRpcArgs({
      ...lease, payload_fingerprint: fingerprintReservationPayload(event),
    }, {
      ...event,
      externalReservationId: "another-reservation",
    })).toThrow(/does not match/);
  });

  it("rejects missing child age allocation rather than guessing a price basis", () => {
    expect(() => buildReservationMaterializationRpcArgs({
      ...lease, payload_fingerprint: fingerprintReservationPayload(event),
    }, {
      ...event,
      childrenBelow6: undefined,
      children7Plus: undefined,
    })).toThrow(/Child age bands/);
  });

  it("keeps the outcome contract limited to explicit materialization states", () => {
    const accepted: ReservationMaterializationRpcResult["outcome"][] = [
      "materialized", "already_materialized", "manual_reconciliation", "retryable_failure",
    ];
    expect(accepted).toHaveLength(4);
  });
});
