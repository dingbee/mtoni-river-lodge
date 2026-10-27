import type {
  PaymentProviderAdapter, PaymentIntentRequest, PaymentIntentResult,
  ProviderTransactionStatus, TenantPaymentContext,
} from "../payment-provider.contract";
import { assertPaymentAmount } from "../payment-provider.contract";

const API = {
  sandbox: "https://api.sandbox.payin.co.tz/api/v1",
  live: "https://api.payin.co.tz/api/v1",
} as const;

type PayInPayload = Record<string, unknown>;
function statusOf(value: unknown): ProviderTransactionStatus["status"] {
  switch (String(value ?? "").toLowerCase()) {
    case "completed": return "completed";
    case "failed": case "rejected": case "expired": return "failed";
    case "reversed": return "reversed";
    case "pending": case "processing": case "waiting": case "pending_approval": return "pending";
    default: return "unknown";
  }
}
function numeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function assertContext(context: TenantPaymentContext) {
  if (context.provider !== "payin") throw new Error("PayIn adapter received a different provider context");
  if (context.currency !== "TZS") throw new Error("PayIn Tanzania mobile-money collections require TZS");
  if (!context.credentials.api_key || !context.credentials.api_secret) {
    throw new Error("PayIn requires tenant-scoped api_key and api_secret credentials");
  }
}
async function api(context: TenantPaymentContext, path: string, init: RequestInit = {}): Promise<PayInPayload> {
  assertContext(context);
  const response = await fetch(API[context.environment] + path, {
    ...init,
    headers: {
      Accept: "application/json", "Content-Type": "application/json",
      "X-API-Key": context.credentials.api_key,
      "X-API-Secret": context.credentials.api_secret,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = {};
  try { body = text ? JSON.parse(text) : {}; } catch { /* redact invalid provider body */ }
  if (!response.ok) throw new Error("PayIn request failed (" + response.status + ")");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("PayIn returned an invalid response");
  return body as PayInPayload;
}

export const payinAdapter: PaymentProviderAdapter = {
  provider: "payin",
  capabilities: {
    methods: ["mobile_money"], environments: ["sandbox", "live"],
    supportsStatusCheck: true, supportsRefunds: false, supportsWebhook: true,
  },
  async createIntent(context: TenantPaymentContext, input: PaymentIntentRequest): Promise<PaymentIntentResult> {
    assertContext(context);
    assertPaymentAmount(input.amount, input.currency);
    if (input.currency !== "TZS" || context.currency !== "TZS") throw new Error("PayIn Tanzania mobile-money payments must use TZS");
    if (!Number.isInteger(input.amount)) throw new Error("PayIn TZS collection amount must be a whole shilling");
    if (input.amount < 100 || input.amount > 10_000_000) throw new Error("PayIn collection amount must be between TZS 100 and TZS 10,000,000");
    const phone = String(input.guest.phone ?? "").replace(/[+\s()-]/g, "");
    if (!/^255\d{9}$/.test(phone)) throw new Error("Guest phone must be a Tanzanian number in 255XXXXXXXXX format");
    const idempotencyKey = input.merchantReference.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) throw new Error("A stable merchant reference of at most 255 characters is required for idempotency");
    const body: Record<string, unknown> = {
      phone, amount: input.amount, currency: "TZS",
      reference: input.merchantReference.slice(0, 100),
      description: input.description.slice(0, 255), callback_url: input.callbackUrl,
    };
    const operator = context.publicConfig.operator;
    if (typeof operator === "string" && ["mpesa", "airtel", "tigopesa", "halopesa"].includes(operator)) body.operator = operator;
    const response = await api(context, "/collection", {
      method: "POST", headers: { "X-Idempotency-Key": idempotencyKey }, body: JSON.stringify(body),
    });
    const requestRef = String(response.request_ref ?? "");
    if (response.success === false || !requestRef) throw new Error("PayIn did not return a valid collection reference");
    const mapped = statusOf(response.status);
    return {
      provider: "payin", providerTransactionId: requestRef, merchantReference: input.merchantReference,
      status: mapped === "completed" ? "completed" : mapped === "failed" ? "failed" : "pending",
      ...(typeof response.checkout_url === "string" ? { checkoutUrl: response.checkout_url } : {}),
      instructions: {
        kind: "mobile_money",
        message: typeof response.message === "string" ? response.message : "Approve the payment prompt on your phone. Booking confirmation requires verified provider confirmation.",
        reference: requestRef,
      },
      amount: input.amount, currency: "TZS",
    };
  },
  async getStatus(context: TenantPaymentContext, transactionId: string): Promise<ProviderTransactionStatus> {
    if (!transactionId || !/^[A-Za-z0-9_-]{1,120}$/.test(transactionId)) throw new Error("Invalid PayIn transaction reference");
    const response = await api(context, "/status/" + encodeURIComponent(transactionId));
    return {
      provider: "payin", providerTransactionId: String(response.request_ref ?? transactionId),
      merchantReference: typeof response.external_ref === "string" ? response.external_ref : null,
      status: statusOf(response.status), amount: numeric(response.gross_amount ?? response.amount),
      currency: typeof response.currency === "string" ? response.currency.toUpperCase() : null,
      paymentMethod: typeof response.operator === "string" ? response.operator : "mobile_money",
      providerReference: typeof response.receipt_number === "string" ? response.receipt_number :
        typeof response.operator_ref === "string" ? response.operator_ref : null,
    };
  },
  async verifyWebhook(context: TenantPaymentContext, request: Request): Promise<ProviderTransactionStatus> {
    assertContext(context);
    const timestamp = request.headers.get("x-payin-timestamp") ?? "";
    const signature = request.headers.get("x-payin-signature") ?? "";
    const secret = context.credentials.webhook_secret;
    if (!secret || !timestamp || !signature) throw new Error("PayIn webhook signature configuration is missing");
    const seconds = Number(timestamp);
    if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) throw new Error("PayIn webhook timestamp is invalid or expired");
    const raw = await request.clone().text();
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "." + raw)));
    const expected = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
    const a = new TextEncoder().encode(expected.toLowerCase());
    const b = new TextEncoder().encode(signature.toLowerCase());
    if (a.length !== b.length) throw new Error("Invalid PayIn webhook signature");
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff !== 0) throw new Error("Invalid PayIn webhook signature");
    let payload: PayInPayload;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      payload = parsed as PayInPayload;
    } catch { throw new Error("Invalid PayIn webhook payload"); }
    if (!["payin.completed", "payin.failed"].includes(String(payload.event))) throw new Error("Unsupported PayIn webhook event");
    const requestRef = String(payload.request_ref ?? "");
    if (!requestRef) throw new Error("PayIn webhook is missing request_ref");
    return {
      provider: "payin", providerTransactionId: requestRef,
      merchantReference: typeof payload.external_ref === "string" ? payload.external_ref : null,
      status: statusOf(payload.status), amount: numeric(payload.gross_amount ?? payload.amount),
      currency: typeof payload.currency === "string" ? payload.currency.toUpperCase() : null,
      paymentMethod: typeof payload.operator === "string" ? payload.operator : "mobile_money",
      providerReference: typeof payload.receipt_number === "string" ? payload.receipt_number : null,
      raw: { event: payload.event, timestamp: payload.timestamp },
    };
  },
};
