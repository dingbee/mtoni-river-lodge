import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookVerificationError extends Error {
  constructor(message: string) { super(message); this.name = "WebhookVerificationError"; }
}

function constantTimeHexEqual(expected: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(supplied, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=") || !appSecret.trim()) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return constantTimeHexEqual(expected, signatureHeader.slice(7));
}

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifyResendWebhookSignature(
  rawBody: string | Buffer,
  headers: SvixHeaders,
  signingSecret: string,
  options: { nowSeconds?: number; toleranceSeconds?: number } = {},
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !signingSecret.startsWith("whsec_")) return false;
  if (!/^\d+$/.test(timestamp) || !/^[\w-]{1,200}$/.test(id)) return false;
  const timestampSeconds = Number(timestamp);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(now - timestampSeconds) > tolerance) return false;

  let secret: Buffer;
  try { secret = Buffer.from(signingSecret.slice(6), "base64"); } catch { return false; }
  if (!secret.length) return false;
  const signedContent = Buffer.concat([
    Buffer.from(id + "." + timestamp + ".", "utf8"),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8"),
  ]);
  const expected = createHmac("sha256", secret).update(signedContent).digest();
  return signature.split(" ").some((entry) => {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    try {
      const candidate = Buffer.from(encoded, "base64");
      return candidate.length === expected.length && timingSafeEqual(expected, candidate);
    } catch { return false; }
  });
}
