import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePublicHostname } from "@/lib/public-property.server";

export async function consumePublicRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const hostname = normalizePublicHostname(request.headers.get("host")) ?? "unknown";
  const forwarded = request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const keyHash = createHash("sha256")
    .update([scope, hostname, forwarded].join("|"))
    .digest("hex");

  const { data, error } = await (supabaseAdmin as any).rpc("staynas_consume_public_rate_limit", {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[public-rate-limit] rate limiter unavailable", { scope, code: error.code ?? "unknown" });
    return false;
  }
  return data === true;
}
