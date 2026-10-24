import type {
  PaymentProviderAdapter,
  PaymentIntentRequest,
  PaymentIntentResult,
  ProviderTransactionStatus,
  TenantPaymentContext,
} from "../payment-provider.contract";
import { assertPaymentAmount } from "../payment-provider.contract";

const API = {
  sandbox: "https://cybqa.pesapal.com/pesapalv3",
  live: "https://pay.pesapal.com/v3",
} as const;

type Token = { token?: string; expiryDate?: string };
type PesapalStatus = {
  payment_method?: string;
  amount?: number;
  currency?: string;
  status_code?: number;
  merchant_reference?: string;
  payment_status_description?: string;
  confirmation_code?: string;
  error?: unknown;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function request(
  context: TenantPaymentContext,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Record<string, unknown>> {
  const key = context.credentials.consumer_key;
  const secret = context.credentials.consumer_secret;
  if (!key || !secret) throw new Error("Pesapal integration requires consumer_key and consumer_secret");
  const cacheKey = `${context.integrationId}:${context.environment}`;
  let cached = tokenCache.get(cacheKey);
  if (!cached || cached.expiresAt < Date.now() + 30_000) {
    const auth = await fetch(`${API[context.environment]}/api/Auth/RequestToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
    });
    const payload = (await auth.json()) as Token;
    if (!auth.ok || !payload.token) throw new Error(`Pesapal authentication failed (${auth.status})`);
    const expiry = payload.expiryDate ? new Date(payload.expiryDate).getTime() : Date.now() + 4 * 60_000;
    cached = { token: payload.token, expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + 4 * 60_000 };
    tokenCache.set(cacheKey, cached);
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${cached.token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API[context.environment]}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await response.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
  if (!response.ok) throw new Error(`Pesapal request failed (${response.status})`);
  return parsed as Record<string, unknown>;
}

export const pesapalAdapter: PaymentProviderAdapter = {
  provider: "pesapal",
  capabilities: {
    methods: ["card", "mobile_money"],
    environments: ["sandbox", "live"],
    supportsStatusCheck: true,
    supportsRefunds: false,
    supportsWebhook: true,
  },

  async createIntent(context: TenantPaymentContext, input: PaymentIntentRequest): Promise<PaymentIntentResult> {
    assertPaymentAmount(input.amount, input.currency);
    if (context.provider !== "pesapal") throw new Error("Pesapal adapter received a different provider context");
    if (context.propertyId !== context.publicConfig.property_id && context.publicConfig.property_id) {
      throw new Error("Pesapal integration property mismatch");
    }
    const notificationId = String(context.credentials.ipn_id ?? context.publicConfig.ipn_id ?? "").trim();
    if (!notificationId) throw new Error("Pesapal IPN must be configured for this tenant in Founder Admin before accepting payments");

    const billing: Record<string, string> = { email_address: input.guest.email };
    if (input.guest.phone) billing.phone_number = input.guest.phone;
    if (input.guest.firstName) billing.first_name = input.guest.firstName;
    if (input.guest.lastName) billing.last_name = input.guest.lastName;
    if (input.guest.countryCode) billing.country_code = input.guest.countryCode;

    const response = await request(context, "/api/Transactions/SubmitOrderRequest", {
      method: "POST",
      json: {
        id: input.merchantReference,
        currency: input.currency,
        amount: Number(input.amount.toFixed(2)),
        description: input.description.slice(0, 100),
        callback_url: input.returnUrl,
        notification_id: notificationId,
        billing_address: billing,
      },
    });
    const trackingId = String(response.order_tracking_id ?? "");
    const merchantReference = String(response.merchant_reference ?? "");
    const checkoutUrl = String(response.redirect_url ?? "");
    if (!trackingId || !checkoutUrl || merchantReference !== input.merchantReference) {
      const error = response.error as { message?: string; code?: string } | undefined;
      throw new Error(error?.message ?? error?.code ?? "Pesapal did not return a valid checkout response");
    }
    return {
      provider: this.provider,
      providerTransactionId: trackingId,
      merchantReference,
      status: "pending",
      checkoutUrl,
      amount: input.amount,
      currency: input.currency,
      raw: response,
    };
  },

  async getStatus(context: TenantPaymentContext, providerTransactionId: string): Promise<ProviderTransactionStatus> {
    const response = await request(
      context,
      `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(providerTransactionId)}`,
      { method: "GET" },
    ) as PesapalStatus;
    const code = response.status_code;
    const status: ProviderTransactionStatus["status"] =
      code === 1 ? "completed" : code === 2 ? "failed" : code === 3 ? "reversed" : "pending";
    return {
      provider: this.provider,
      providerTransactionId,
      merchantReference: response.merchant_reference ?? null,
      status,
      amount: response.amount == null ? null : Number(response.amount),
      currency: response.currency ?? null,
      paymentMethod: response.payment_method ?? null,
      providerReference: response.confirmation_code ?? null,
      raw: response,
    };
  },
};
