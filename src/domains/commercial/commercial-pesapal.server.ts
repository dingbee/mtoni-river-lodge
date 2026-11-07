const SANDBOX = "https://cybqa.pesapal.com/pesapalv3";
const LIVE = "https://pay.pesapal.com/v3";
type TenantPesapalSecret = { consumerKey: string; consumerSecret: string; environment: "sandbox" | "live"; ipnId: string };
type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

function loadSecret(secretRef: string): TenantPesapalSecret {
  if (!/^STAYNAS_PROVIDER_SECRET_[A-Z0-9_]+$/.test(secretRef)) {
    throw new Error("Provider secret reference is not an approved server environment key.");
  }
  const raw = process.env[secretRef];
  if (!raw) throw new Error("Tenant Pesapal credentials are not provisioned in server secret storage.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Tenant Pesapal secret payload is invalid."); }
  const value = parsed as Partial<TenantPesapalSecret>;
  if (typeof value.consumerKey !== "string" || !value.consumerKey
    || typeof value.consumerSecret !== "string" || !value.consumerSecret
    || (value.environment !== "sandbox" && value.environment !== "live")
    || typeof value.ipnId !== "string" || !value.ipnId) {
    throw new Error("Tenant Pesapal secret payload is incomplete.");
  }
  return value as TenantPesapalSecret;
}

function baseUrl(environment: TenantPesapalSecret["environment"]) {
  return environment === "live" ? LIVE : SANDBOX;
}

async function tokenFor(providerAccountId: string, secret: TenantPesapalSecret) {
  const cached = tokenCache.get(providerAccountId);
  if (cached && cached.expiresAt > Date.now() + 30000) return cached.token;
  const response = await fetch(`${baseUrl(secret.environment)}/api/Auth/RequestToken`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: secret.consumerKey, consumer_secret: secret.consumerSecret }),
  });
  const body = await response.json() as { token?: string; expiryDate?: string };
  if (!response.ok || !body.token) throw new Error("Tenant Pesapal authentication failed.");
  const expiresAt = body.expiryDate ? new Date(body.expiryDate).getTime() : Date.now() + 240000;
  tokenCache.set(providerAccountId, { token: body.token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 240000 });
  return body.token;
}

async function pesapalRequest(providerAccountId: string, secret: TenantPesapalSecret, path: string, method: string, body?: unknown) {
  const token = await tokenFor(providerAccountId, secret);
  const response = await fetch(`${baseUrl(secret.environment)}${path}`, {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : {}; } catch { throw new Error("Pesapal returned a non-JSON response."); }
  if (!response.ok) throw new Error(`Pesapal request failed with status ${response.status}.`);
  return json as Record<string, unknown>;
}

export async function initiateTenantPesapalOrder(input: {
  providerAccountId: string; secretRef: string; paymentId: string; amountMinor: number;
  currency: "TZS" | "USD"; email: string; phone?: string | null; firstName: string; lastName: string;
  callbackUrl: string;
}) {
  const secret = loadSecret(input.secretRef);
  const merchantReference = `SN-COM-${input.paymentId}`;
  const result = await pesapalRequest(input.providerAccountId, secret, "/api/Transactions/SubmitOrderRequest", "POST", {
    id: merchantReference, currency: input.currency, amount: input.amountMinor / 100,
    description: `StayNas subscription invoice payment ${input.paymentId}`,
    callback_url: input.callbackUrl, notification_id: secret.ipnId,
    billing_address: { email_address: input.email, ...(input.phone ? { phone_number: input.phone } : {}), first_name: input.firstName, last_name: input.lastName },
  });
  if (typeof result.order_tracking_id !== "string" || typeof result.redirect_url !== "string") {
    throw new Error("Pesapal did not return a valid commercial checkout order.");
  }
  return { orderTrackingId: result.order_tracking_id, merchantReference, redirectUrl: result.redirect_url };
}

export async function queryTenantPesapalStatus(input: {
  providerAccountId: string; secretRef: string; orderTrackingId: string;
}) {
  const secret = loadSecret(input.secretRef);
  const result = await pesapalRequest(input.providerAccountId, secret,
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(input.orderTrackingId)}`, "GET");
  return {
    amount: typeof result.amount === "number" ? result.amount : Number(result.amount),
    currency: typeof result.currency === "string" ? result.currency : null,
    statusCode: typeof result.status_code === "number" ? result.status_code : Number(result.status_code),
    confirmationCode: typeof result.confirmation_code === "string" ? result.confirmation_code : null,
    merchantReference: typeof result.merchant_reference === "string" ? result.merchant_reference : null,
    paymentMethod: typeof result.payment_method === "string" ? result.payment_method : null,
  };
}
