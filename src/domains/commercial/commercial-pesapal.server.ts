const SANDBOX = "https://cybqa.pesapal.com/pesapalv3";
const LIVE = "https://pay.pesapal.com/v3";
type TenantPesapalSecret = { consumerKey: string; consumerSecret: string; environment: "sandbox" | "live"; ipnId: string };
type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

async function loadSecret(secretRef: string): Promise<TenantPesapalSecret> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(secretRef)) {
    throw new Error("Provider credential reference must identify a Supabase Vault secret.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The RPC is service-role-only and returns decrypted material only to this server process.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any).rpc("staynas_read_provider_secret", { _secret_id: secretRef });
  if (error || typeof data !== "string") throw new Error("Provider credentials could not be read from secure Vault storage.");
  let parsed: unknown;
  try { parsed = JSON.parse(data); } catch { throw new Error("Tenant Pesapal credentials are not valid JSON."); }
  const value = parsed as Partial<TenantPesapalSecret>;
  if (typeof value.consumerKey !== "string" || !value.consumerKey
    || typeof value.consumerSecret !== "string" || !value.consumerSecret
    || (value.environment !== "sandbox" && value.environment !== "live")
    || typeof value.ipnId !== "string" || !value.ipnId) {
    throw new Error("Tenant Pesapal credentials are incomplete.");
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
  const secret = await loadSecret(input.secretRef);
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
  const secret = await loadSecret(input.secretRef);
  const result = await pesapalRequest(input.providerAccountId, secret,
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(input.orderTrackingId)}`, "GET");
  return {
    amount: String(result.amount),
    currency: typeof result.currency === "string" ? result.currency : null,
    statusCode: typeof result.status_code === "number" ? result.status_code : Number(result.status_code),
    confirmationCode: typeof result.confirmation_code === "string" ? result.confirmation_code : null,
    merchantReference: typeof result.merchant_reference === "string" ? result.merchant_reference : null,
    paymentMethod: typeof result.payment_method === "string" ? result.payment_method : null,
  };
}
