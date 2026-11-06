import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type EncryptedReservationPayload = Readonly<{
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: string;
  payloadFingerprint: string;
}>;

function assertKey(key: Uint8Array): Buffer {
  const normalized = Buffer.from(key);
  if (normalized.byteLength !== 32) {
    throw new Error("Distribution reservation encryption key must be exactly 32 bytes.");
  }
  return normalized;
}

export function reservationPayloadAad(
  providerKey: string,
  externalAccountId: string,
  providerEventId: string,
): Buffer {
  if (![providerKey, externalAccountId, providerEventId].every((value) => value.trim())) {
    throw new Error("Reservation payload encryption context is incomplete.");
  }
  return Buffer.from(
    `staynas:reservation:v1:${providerKey}:${externalAccountId}:${providerEventId}`,
    "utf8",
  );
}

export function fingerprintReservationPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function encryptReservationPayload(
  payload: unknown,
  key: Uint8Array,
  aad: Uint8Array,
  keyVersion = "v1",
): EncryptedReservationPayload {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyVersion)) {
    throw new Error("Reservation payload key version is invalid.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", assertKey(key), nonce);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Object.freeze({
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion,
    payloadFingerprint: fingerprintReservationPayload(payload),
  });
}

export function decryptReservationPayload<T>(
  encrypted: Pick<EncryptedReservationPayload, "ciphertext" | "nonce" | "authTag">,
  key: Uint8Array,
  aad: Uint8Array,
): T {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    assertKey(key),
    Buffer.from(encrypted.nonce, "base64"),
  );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function readReservationPayloadKey(
  keyVersion = "v1",
): Buffer {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyVersion)) {
    throw new Error("Reservation payload key version is invalid.");
  }
  const versionedName = `STAYNAS_DISTRIBUTION_PII_ENCRYPTION_KEY_${keyVersion.toUpperCase()}`;
  const value = process.env[versionedName] ??
    (keyVersion === "v1" ? process.env.STAYNAS_DISTRIBUTION_PII_ENCRYPTION_KEY : undefined);
  if (!value?.trim()) {
    throw new Error(`${versionedName} is not configured.`);
  }
  return assertKey(Buffer.from(value.trim(), "base64"));
}

export function readReservationPayloadKeyVersion(
  value = process.env.STAYNAS_DISTRIBUTION_PII_KEY_VERSION,
): string {
  const version = value?.trim() || "v1";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(version)) {
    throw new Error("STAYNAS_DISTRIBUTION_PII_KEY_VERSION is invalid.");
  }
  return version;
}
