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
  if (!key || !secret) throw new Error("Pesapal credentials missing");
  const res = await fetch(`${pesapalBaseUrl()}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
  });
  const json = (await res.json()) as TokenResp;
  if (!res.ok || !json.token) {
    throw new Error(`Pesapal auth failed: ${res.status} ${JSON.stringify(json)}`);
  }
  const expiresAt = new Date(json.expiryDate).getTime();
  cachedToken = { token: json.token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 4 * 60_000 };
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
  const sb = supabaseAdmin as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { ipn_id: string; ipn_url: string } | null }> } };
      upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error: unknown }>;
    };
  };
  const { data: existing } = await sb.from("pesapal_settings").select("ipn_id, ipn_url").eq("env", env).maybeSingle();
  if (existing && existing.ipn_url === ipnUrl) return existing.ipn_id;
  const reg = await pesapalFetch("/api/URLSetup/RegisterIPN", {
    method: "POST",
    json: { url: ipnUrl, ipn_notification_type: "GET" },
  });
  const ipnId = String((reg as { ipn_id?: string }).ipn_id ?? "");
  if (!ipnId) throw new Error(`Pesapal RegisterIPN returned no ipn_id: ${JSON.stringify(reg)}`);
  await sb.from("pesapal_settings").upsert(
    { env, ipn_id: ipnId, ipn_url: ipnUrl, updated_at: new Date().toISOString() },
    { onConflict: "env" },
  );
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
  const res = await pesapalFetch("/api/Transactions/SubmitOrderRequest", { method: "POST", json: body });
  return res as {
    order_tracking_id: string;
    merchant_reference: string;
    redirect_url: string;
    status: string;
    error?: unknown;
  };
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