import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReservationIngressExecutionContext } from "./ingest.server";
import { externalReservationSchema, type ExternalReservationEvent } from "./reservation-ingestion.contracts";

const verifiedBrand: unique symbol = Symbol("VerifiedReservationWebhook");

export type VerifiedReservationWebhook = Readonly<{
  context: ReservationIngressExecutionContext;
  event: ExternalReservationEvent;
  [verifiedBrand]: true;
}>;

export type ReservationWebhookSignatureInput = Readonly<{
  rawBody: string | Buffer;
  signature: string | null;
  timestamp: string | null;
  context: ReservationIngressExecutionContext;
  signingSecret: string;
}>;

export type ReservationWebhookVerificationOptions = Readonly<{
  nowSeconds?: number;
  toleranceSeconds?: number;
}>;

/**
 * Verifies the common timestamped HMAC-SHA256 webhook convention:
 * signature = hex(HMAC(secret, timestamp + "." + exactRawBody)).
 * Provider adapters with different canonicalization/signature formats must
 * implement their own verifier and must not route around this verified type.
 */
export function verifyHmacSha256ReservationWebhook(
  input: ReservationWebhookSignatureInput,
  options: ReservationWebhookVerificationOptions = {},
): VerifiedReservationWebhook {
  if (!input.signingSecret.trim() || !input.signature || !input.timestamp) {
    throw new Error("Reservation webhook signature material is incomplete.");
  }
  if (!/^\d{10}$/.test(input.timestamp)) {
    throw new Error("Reservation webhook timestamp is invalid.");
  }
  const timestampSeconds = Number(input.timestamp);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(now - timestampSeconds) > tolerance) {
    throw new Error("Reservation webhook timestamp is outside the accepted replay window.");
  }

  const supplied = input.signature.startsWith("sha256=")
    ? input.signature.slice(7)
    : input.signature;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) {
    throw new Error("Reservation webhook signature encoding is invalid.");
  }
  const raw = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(input.rawBody, "utf8");
  const expected = createHmac("sha256", input.signingSecret)
    .update(input.timestamp + ".")
    .update(raw)
    .digest();
  const actual = Buffer.from(supplied, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) {
    throw new Error("Reservation webhook signature verification failed.");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Verified reservation webhook body is not valid JSON.");
  }
  const event = externalReservationSchema.parse(decoded);
  if (event.providerKey !== input.context.providerKey ||
      event.externalAccountReference !== input.context.externalAccountReference) {
    throw new Error("Verified reservation event does not match its trusted connection context.");
  }
  return Object.freeze({
    context: input.context,
    event,
    [verifiedBrand]: true as const,
  });
}

export function assertVerifiedReservationWebhook(
  value: unknown,
): asserts value is VerifiedReservationWebhook {
  if (!value || typeof value !== "object" ||
      (value as VerifiedReservationWebhook)[verifiedBrand] !== true) {
    throw new Error("Reservation ingress requires a cryptographically verified webhook.");
  }
}
