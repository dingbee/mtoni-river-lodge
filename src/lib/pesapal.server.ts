const SANDBOX = "https://cybqa.pesapal.com/pesapalv3";
const LIVE = "https://pay.pesapal.com/v3";

export type PesapalEnv = "sandbox" | "live";

export function pesapalEnv(): PesapalEnv {
  const v = (process.env.PESAPAL_ENV ?? "sandbox").toLowerCase();
  return v === "live" || v === "production" ? "live" : "sandbox";
}

export function pesapalBaseUrl(): string {
  return pesapalEnv() === "live" ? LIVE : SANDBOX;
}

type TokenResp = { token: string; expiryDate: string; error?: unknown; status?: string };

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getPesapalToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const key = process.env.PESAPAL_CONSUMER_KEY;
  const secret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!key || !secret) {
    console.error("[pesapal] credentials missing", {
      env: pesapalEnv(),
      hasKey: Boolean(key),
      hasSecret: Boolean(secret),
    });
    throw new Error("Pesapal credentials missing (PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET)");
  }
  console.info("[pesapal] requesting auth token", {
    env: pesapalEnv(),
    baseUrl: pesapalBaseUrl(),
    keyPrefix: key.slice(0, 6),
  });
  const res = await fetch(`${pesapalBaseUrl()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  const json = (await res.json()) as TokenResp;
  if (!res.ok || !json.token) {
    console.error("[pesapal] auth failed", { status: res.status, body: json });
    throw new Error(`Pesapal auth failed: ${res.status} ${JSON.stringify(json)}`);
  }
  const expiresAt = new Date(json.expiryDate).getTime();
  cachedToken = { token: json.token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 4 * 60_000 };
  console.info("[pesapal] auth token acquired", { expiresAt: json.expiryDate });
  return json.token;
}

async function pesapalFetch(path: string, init: RequestInit & { json?: unknown } = {}) {
  const token = await getPesapalToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${pesapalBaseUrl()}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Pesapal ${path} failed: ${res.status} ${text}`);
  return json as Record<string, unknown>;
}

export async function ensureIpn(baseUrl: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const env = pesapalEnv();
  const ipnUrl = `${baseUrl.replace(/\/$/, "")}/api/public/pesapal/ipn`;

  // Preferred path: use a pre-provisioned IPN ID from the environment.
  // This guarantees the ID belongs to the same Pesapal account as the
  // consumer key/secret and avoids per-deploy re-registration.
  const envIpnId = process.env.PESAPAL_IPN_ID?.trim();
  if (envIpnId) {
    console.info("[pesapal] using PESAPAL_IPN_ID from environment", {
      env,
      ipnUrl,
      ipnIdSuffix: envIpnId.slice(-6),
      ipnIdLength: envIpnId.length,
    });
    // Keep pesapal_settings in sync so ops tooling still reflects reality.
    await supabaseAdmin
      .from("pesapal_settings")
      .upsert(
        { env, ipn_id: envIpnId, ipn_url: ipnUrl, updated_at: new Date().toISOString() },
        { onConflict: "env" },
      );
    return envIpnId;
  }

  const { data: existing } = await supabaseAdmin
    .from("pesapal_settings")
    .select("ipn_id, ipn_url")
    .eq("env", env)
    .maybeSingle();
  if (existing && existing.ipn_url === ipnUrl) {
    console.info("[pesapal] using cached IPN registration", { env, ipnUrl, ipnId: existing.ipn_id });
    return existing.ipn_id;
  }
  console.info("[pesapal] registering IPN", { env, ipnUrl, previous: existing?.ipn_url ?? null });
  const reg = await pesapalFetch("/api/URLSetup/RegisterIPN", {
    method: "POST",
    json: { url: ipnUrl, ipn_notification_type: "GET" },
  });
  const ipnId = String((reg as { ipn_id?: string }).ipn_id ?? "");
  if (!ipnId) {
    console.error("[pesapal] RegisterIPN returned no ipn_id", { reg });
    throw new Error(`Pesapal RegisterIPN returned no ipn_id: ${JSON.stringify(reg)}`);
  }
  await supabaseAdmin
    .from("pesapal_settings")
    .upsert({ env, ipn_id: ipnId, ipn_url: ipnUrl, updated_at: new Date().toISOString() }, { onConflict: "env" });
  return ipnId;
}

export type SubmitOrderInput = {
  merchantReference: string;
  amount: number;
  currency: string;
  description: string;
  callbackUrl: string;
  notificationId: string;
  email: string;
  phone?: string | null;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
};

export async function submitPesapalOrder(input: SubmitOrderInput) {
  const billing: Record<string, string> = { email_address: input.email };
  if (input.phone) billing.phone_number = input.phone;
  if (input.firstName) billing.first_name = input.firstName;
  if (input.lastName) billing.last_name = input.lastName;
  if (input.countryCode) billing.country_code = input.countryCode;
  const body = {
    id: input.merchantReference,
    currency: input.currency,
    amount: Number(input.amount.toFixed(2)),
    description: input.description.slice(0, 100),
    callback_url: input.callbackUrl,
    notification_id: input.notificationId,
    billing_address: billing,
  };
  console.info("[pesapal] submitting order", {
    merchantReference: input.merchantReference,
    amount: body.amount,
    currency: body.currency,
    callbackUrl: input.callbackUrl,
    notificationId: input.notificationId,
    env: pesapalEnv(),
  });
  const res = await pesapalFetch("/api/Transactions/SubmitOrderRequest", { method: "POST", json: body });
  const parsed = res as {
    order_tracking_id: string;
    merchant_reference: string;
    redirect_url: string;
    status: string;
    error?: { code?: string; error_type?: string; message?: string } | null;
  };
  // Pesapal returns HTTP 200 with an error body for merchant-side rejections
  // (e.g. amount_exceeds_default_limit). Treat any missing redirect_url
  // as a hard failure so the caller surfaces the real reason instead of
  // silently sending the guest to a blank confirmation screen.
  if (!parsed.redirect_url || !parsed.order_tracking_id) {
    const err = parsed.error;
    const message =
      (err && (err.message || err.code)) ||
      `Pesapal did not return a checkout URL (status ${parsed.status ?? "unknown"})`;
    console.error("[pesapal] order rejected", { response: parsed });
    throw new Error(`Pesapal order rejected: ${message}`);
  }
  console.info("[pesapal] order accepted", {
    orderTrackingId: parsed.order_tracking_id,
    merchantReference: parsed.merchant_reference,
  });
  return parsed;
}

export async function getPesapalTransactionStatus(orderTrackingId: string) {
  return (await pesapalFetch(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
    { method: "GET" },
  )) as {
    payment_method?: string;
    amount?: number;
    currency?: string;
    created_date?: string;
    confirmation_code?: string;
    payment_status_description?: string;
    description?: string;
    message?: string;
    payment_account?: string;
    call_back_url?: string;
    status_code?: number; // 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED
    merchant_reference?: string;
    payment_status_code?: string;
    currency_code?: string;
    error?: unknown;
    status?: string;
  };
}

export function classifyStatus(statusCode: number | undefined):
  "pending" | "completed" | "failed" | "reversed" {
  if (statusCode === 1) return "completed";
  if (statusCode === 2) return "failed";
  if (statusCode === 3) return "reversed";
  return "pending";
}

// Property guest-payment adapter surface. Unlike the legacy platform environment
// helpers above, these functions require the exact property account credentials
// and environment resolved from the property-scoped Vault account.
export type PesapalPropertyCredentials = {
  consumer_key: string;
  consumer_secret: string;
};

export type PesapalPropertyEnvironment = "sandbox" | "live";

const propertyTokenCache = new Map<string, { token: string; expiresAt: number }>();

function propertyPesapalBaseUrl(environment: PesapalPropertyEnvironment) {
  return environment === "live" ? LIVE : SANDBOX;
}

export function normalizePesapalPropertyCredentials(
  credentials: PesapalPropertyCredentials | Record<string, unknown>,
): PesapalPropertyCredentials {
  const row = credentials as Record<string, unknown>;
  const consumerKey = row.consumer_key ?? row.consumerKey;
  const consumerSecret = row.consumer_secret ?? row.consumerSecret;
  if (typeof consumerKey !== "string" || !consumerKey.trim()
    || typeof consumerSecret !== "string" || !consumerSecret.trim()) {
    throw new Error("Property Pesapal credentials are incomplete.");
  }
  return { consumer_key: consumerKey.trim(), consumer_secret: consumerSecret.trim() };
}

export async function getPesapalPropertyAccountToken(
  credentialsInput: PesapalPropertyCredentials | Record<string, unknown>,
  environment: PesapalPropertyEnvironment,
): Promise<string> {
  const credentials = normalizePesapalPropertyCredentials(credentialsInput);
  const cacheKey = \`\${environment}:\${credentials.consumer_key}\`;
  const cached = propertyTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const response = await fetch(\`\${propertyPesapalBaseUrl(environment)}/api/Auth/RequestToken\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: credentials.consumer_key,
      consumer_secret: credentials.consumer_secret,
    }),
  });
  const json = (await response.json()) as TokenResp;
  if (!response.ok || !json.token) {
    throw new Error(\`Property Pesapal authentication failed: HTTP \${response.status}\`);
  }
  const expiry = new Date(json.expiryDate).getTime();
  const expiresAt = Number.isFinite(expiry) ? expiry : Date.now() + 4 * 60_000;
  propertyTokenCache.set(cacheKey, { token: json.token, expiresAt });
  return json.token;
}

async function propertyPesapalFetch(
  path: string,
  credentials: PesapalPropertyCredentials,
  environment: PesapalPropertyEnvironment,
  init: RequestInit & { json?: unknown } = {},
) {
  const token = await getPesapalPropertyAccountToken(credentials, environment);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: \`Bearer \${token}\`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(\`\${propertyPesapalBaseUrl(environment)}\${path}\`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const text = await response.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(\`Property Pesapal request failed: HTTP \${response.status}\`);
  return json as Record<string, unknown>;
}

export async function testPesapalPropertyAccount(
  credentials: PesapalPropertyCredentials | Record<string, unknown>,
  environment: PesapalPropertyEnvironment,
) {
  await getPesapalPropertyAccountToken(credentials, environment);
  return { ok: true as const, provider: "pesapal" as const, environment };
}

export async function ensurePesapalPropertyAccountIpn(
  baseUrl: string,
  credentials: PesapalPropertyCredentials,
  environment: PesapalPropertyEnvironment,
  existingIpnId?: string | null,
) {
  const origin = new URL(baseUrl).origin;
  const ipnUrl = \`\${origin}/api/public/pesapal/ipn\`;
  if (existingIpnId?.trim()) return { ipnId: existingIpnId.trim(), ipnUrl };
  const response = await propertyPesapalFetch(
    "/api/URLSetup/RegisterIPN",
    credentials,
    environment,
    { method: "POST", json: { url: ipnUrl, ipn_notification_type: "GET" } },
  );
  const ipnId = String(response.ipn_id ?? "").trim();
  if (!ipnId) throw new Error("Property Pesapal account did not return an IPN registration ID.");
  return { ipnId, ipnUrl };
}

export async function submitPesapalPropertyAccountOrder(
  input: SubmitOrderInput,
  credentials: PesapalPropertyCredentials,
  environment: PesapalPropertyEnvironment,
) {
  const billing: Record<string, string> = { email_address: input.email };
  if (input.phone) billing.phone_number = input.phone;
  if (input.firstName) billing.first_name = input.firstName;
  if (input.lastName) billing.last_name = input.lastName;
  if (input.countryCode) billing.country_code = input.countryCode;
  const response = await propertyPesapalFetch(
    "/api/Transactions/SubmitOrderRequest",
    credentials,
    environment,
    {
      method: "POST",
      json: {
        id: input.merchantReference,
        currency: input.currency,
        amount: Number(input.amount.toFixed(2)),
        description: input.description.slice(0, 100),
        callback_url: input.callbackUrl,
        notification_id: input.notificationId,
        billing_address: billing,
      },
    },
  );
  const parsed = response as {
    order_tracking_id?: string;
    merchant_reference?: string;
    redirect_url?: string;
    status?: string;
    error?: { code?: string; error_type?: string; message?: string } | null;
  };
  if (!parsed.redirect_url || !parsed.order_tracking_id) {
    throw new Error(
      \`Property Pesapal order rejected: \${parsed.error?.message || parsed.error?.code || parsed.status || "no checkout URL"}\`,
    );
  }
  return {
    order_tracking_id: parsed.order_tracking_id,
    merchant_reference: parsed.merchant_reference ?? input.merchantReference,
    redirect_url: parsed.redirect_url,
    status: parsed.status ?? "200",
  };
}

export async function getPesapalPropertyAccountTransactionStatus(
  orderTrackingId: string,
  credentials: PesapalPropertyCredentials,
  environment: PesapalPropertyEnvironment,
) {
  return (await propertyPesapalFetch(
    \`/api/Transactions/GetTransactionStatus?orderTrackingId=\${encodeURIComponent(orderTrackingId)}\`,
    credentials,
    environment,
    { method: "GET" },
  )) as {
    payment_method?: string;
    amount?: number;
    currency?: string;
    status_code?: number;
    merchant_reference?: string;
    payment_status_description?: string;
    error?: unknown;
    status?: string;
  };
}
