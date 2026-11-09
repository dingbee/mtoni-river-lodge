import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class PublicPropertyResolutionError extends Error {
  constructor() {
    super("This website is not configured for guest concierge services.");
    this.name = "PublicPropertyResolutionError";
  }
}

export function normalizePublicHostname(input: string | null | undefined): string | null {
  if (!input || input.length > 255) return null;
  const raw = input.trim().toLowerCase();
  if (!raw || /[,\s/@\\]/.test(raw)) return null;
  const withoutPort = raw.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(withoutPort)) return null;
  return withoutPort;
}

/**
 * Resolve a public guest property exclusively from the request hostname and
 * a verified domain ownership record. The browser never supplies a property ID.
 * Platform-owned hostnames use the same founder-managed domain registry.
 */
export async function resolvePublicPropertyFromHostname(hostHeader: string | null | undefined): Promise<string> {
  const hostname = normalizePublicHostname(hostHeader);
  if (!hostname) throw new PublicPropertyResolutionError();

  const { data: domains, error: domainError } = await (supabaseAdmin as any)
    .from("staynas_property_domains")
    .select("property_id")
    .eq("hostname", hostname)
    .eq("verification_status", "verified")
    .not("verified_at", "is", null)
    .limit(2);

  if (domainError || !domains || domains.length !== 1 || !domains[0]?.property_id) {
    throw new PublicPropertyResolutionError();
  }

  const { data: property, error: propertyError } = await (supabaseAdmin as any)
    .from("staynas_properties")
    .select("id")
    .eq("id", domains[0].property_id)
    .eq("status", "active")
    .not("currency", "is", null)
    .maybeSingle();

  if (propertyError || !property) throw new PublicPropertyResolutionError();
  return property.id;
}
