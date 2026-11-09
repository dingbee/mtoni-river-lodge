import { getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicBookingChannelContext = {
  propertyId: string;
  channelId: string;
  channelCode: "direct_web";
  currency: string;
  domainId: string;
  hostname: string;
};

/**
 * Resolves a guest booking from the request host through a verified property
 * domain and an explicitly published channel. It never uses staff membership,
 * client-supplied property IDs, or the founder/UAT tenant as a fallback.
 */
export async function resolvePublicDirectBookingChannel(
  sb: SupabaseClient<any>,
  hostOverride?: string,
): Promise<PublicBookingChannelContext> {
  const rawHost = hostOverride ?? getRequestHeader("host") ?? "";
  const hostname = rawHost.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  if (!hostname || hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname)) {
    throw new Error("Public booking host is invalid");
  }

  const { data: domain, error: domainError } = await (sb as any)
    .from("staynas_property_domains")
    .select("id, property_id, hostname, verification_status, verified_at")
    .eq("hostname", hostname)
    .eq("verification_status", "verified")
    .not("verified_at", "is", null)
    .maybeSingle();
  if (domainError) throw new Error("Public booking domain lookup failed");
  if (!domain) throw new Error("This domain is not verified for public booking");

  const { data: channel, error: channelError } = await (sb as any)
    .from("staynas_public_booking_channels")
    .select("id, property_id, domain_id, channel_code, route_path, transaction_currency, status")
    .eq("property_id", domain.property_id)
    .eq("domain_id", domain.id)
    .eq("channel_code", "direct_web")
    .eq("route_path", "/book")
    .eq("status", "published")
    .maybeSingle();
  if (channelError) throw new Error("Public booking channel lookup failed");
  if (!channel) throw new Error("The official direct-booking channel is not published");
  if (!/^[A-Z]{3}$/.test(channel.transaction_currency ?? "")) {
    throw new Error("Public booking channel has no valid transaction currency");
  }

  const { data: property, error: propertyError } = await (sb as any)
    .from("staynas_properties")
    .select("id, status")
    .eq("id", domain.property_id)
    .maybeSingle();
  if (propertyError) throw new Error("Public booking property lookup failed");
  if (!property || property.status !== "active") {
    throw new Error("The property is not accepting public bookings");
  }

  return {
    propertyId: domain.property_id,
    channelId: channel.id,
    channelCode: "direct_web",
    currency: channel.transaction_currency,
    domainId: domain.id,
    hostname,
  };
}
