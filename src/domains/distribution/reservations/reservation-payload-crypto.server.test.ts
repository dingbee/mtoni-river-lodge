import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  decryptReservationPayload,
  encryptReservationPayload,
  fingerprintReservationPayload,
  reservationPayloadAad,
} from "./reservation-payload-crypto.server";

describe("DC-05 encrypted reservation payload boundary", () => {
  it("encrypts and decrypts provider PII with authenticated context", () => {
    const key = randomBytes(32);
    const aad = reservationPayloadAad("airbnb", "external-account-1", "event-1");
    const payload = {
      externalReservationId: "reservation-1",
      guest: { firstName: "Amina", email: "amina@example.test" },
    };
    const encrypted = encryptReservationPayload(payload, key, aad);
    expect(encrypted.ciphertext).not.toContain("Amina");
    expect(decryptReservationPayload(encrypted, key, aad)).toEqual(payload);
    expect(encrypted.payloadFingerprint).toBe(fingerprintReservationPayload(payload));
  });

  it("rejects tampered ciphertext and a mismatched provider/account/event context", () => {
    const key = randomBytes(32);
    const aad = reservationPayloadAad("airbnb", "external-account-1", "event-1");
    const encrypted = encryptReservationPayload({ guest: "Amina" }, key, aad);
    expect(() => decryptReservationPayload(
      { ...encrypted, ciphertext: Buffer.from("tampered").toString("base64") }, key, aad,
    )).toThrow();
    expect(() => decryptReservationPayload(
      encrypted, key, reservationPayloadAad("airbnb", "external-account-2", "event-1"),
    )).toThrow();
  });

  it("rejects invalid keys and key versions", () => {
    expect(() => encryptReservationPayload({}, randomBytes(16), Buffer.from("aad"))).toThrow(/32 bytes/);
    expect(() => encryptReservationPayload({}, randomBytes(32), Buffer.from("aad"), "../key")).toThrow(/version/);
  });
});
