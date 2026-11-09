/**
 * LB-01.03 — portable Web Crypto service-request authentication.
 *
 * No secret retrieval, database access, logging or HTTP routing belongs here.
 * Callers must atomically claim the verified nonce in durable storage before
 * processing a request; signature verification alone does not prevent replay.
 */
export const LB01_MAX_CLOCK_SKEW_SECONDS = 300;
export const LB01_SIGNATURE_HEADER = "x-lb01-signature";
export const LB01_TIMESTAMP_HEADER = "x-lb01-timestamp";
export const LB01_NONCE_HEADER = "x-lb01-nonce";

export interface Lb01SignedRequest {
  method: string;
  pathname: string;
  rawBody: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function encodeHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]{64}$/.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function canonicalRequest(input: Omit<Lb01SignedRequest, "signature">): Promise<string> {
  const body = new TextEncoder().encode(input.rawBody);
  const digest = await crypto.subtle.digest("SHA-256", body);
  return [
    "LB01-HMAC-SHA256-V1",
    input.timestamp,
    input.nonce,
    input.method.toUpperCase(),
    input.pathname,
    encodeHex(new Uint8Array(digest)),
  ].join("\n");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function importSecret(secretBase64Url: string): Promise<CryptoKey | null> {
  const raw = decodeBase64Url(secretBase64Url);
  if (!raw || raw.length !== 32) return null;
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signLb01Request(
  secretBase64Url: string,
  input: Omit<Lb01SignedRequest, "signature">,
): Promise<string> {
  const key = await importSecret(secretBase64Url);
  if (!key) throw new Error("LB-01 service secret must decode to exactly 32 bytes.");
  const data = new TextEncoder().encode(await canonicalRequest(input));
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return `v1=${encodeHex(new Uint8Array(signature))}`;
}

/** Verify signature and freshness; durable nonce claiming is a separate mandatory gate. */
export async function verifyLb01Request(
  secretBase64Url: string,
  input: Lb01SignedRequest,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    const key = await importSecret(secretBase64Url);
    if (!key || !Number.isSafeInteger(nowSeconds)) return false;
    if (!/^[0-9]{10}$/.test(input.timestamp)) return false;
    const timestamp = Number(input.timestamp);
    if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > LB01_MAX_CLOCK_SKEW_SECONDS) return false;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.nonce)) return false;
    if (!/^[A-Z]{3,10}$/.test(input.method.toUpperCase())) return false;
    if (!input.pathname.startsWith("/") || input.pathname.includes("\n")) return false;
    const signature = /^v1=([a-f0-9]{64})$/.exec(input.signature);
    if (!signature) return false;
    const data = new TextEncoder().encode(await canonicalRequest(input));
    const bytes = decodeHex(signature[1]);
    if (!bytes) return false;
    return await crypto.subtle.verify("HMAC", key, toArrayBuffer(bytes), data);
  } catch {
    return false;
  }
}
