import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const keyHex = process.env.STAYNAS_PROVIDER_CREDENTIALS_KEY;
  if (!keyHex || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error("Provider credential encryption is not provisioned. Configure the 32-byte server encryption key before saving credentials.");
  }
  return Buffer.from(keyHex, "hex");
}

/** AES-256-GCM envelope; the encryption key remains in server-only deployment secrets. */
export function encryptProviderCredentials(raw: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch {
    throw new Error("Credentials must be valid JSON containing the provider-specific credential fields.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.keys(parsed as Record<string, unknown>).length === 0) {
    throw new Error("Credentials must be a non-empty JSON object.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(parsed), "utf8"), cipher.final()]);
  return `v1.${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}

/** Server-only credential reader. Never call from browser code. */
export function decryptProviderCredentials(envelope: string): Record<string, unknown> {
  const [version, ivHex, tagHex, payloadHex] = envelope.split(".");
  if (version !== "v1" || !ivHex || !tagHex || !payloadHex
    || !/^[a-f0-9]{24}$/i.test(ivHex) || !/^[a-f0-9]{32}$/i.test(tagHex)
    || !/^(?:[a-f0-9]{2})+$/i.test(payloadHex)) {
    throw new Error("Provider credential envelope is invalid.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payloadHex, "hex")), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Credential payload is not an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Provider credentials could not be decrypted. Verify the configured encryption key and stored envelope.");
  }
}
