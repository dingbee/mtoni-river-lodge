import { BookingPropertyError } from "@/lib/booking-property";

const PUBLIC_BOOKING_PROPERTY_SLUGS = new Set(["nolmark-cdma-staynas"]);

/**
 * Resolve the published guest property from a server-owned allowlist.
 * The browser may request a slug, but the slug is not authority: it must be
 * explicitly allowlisted and the active property record is resolved server-side.
 * This demo resolver deliberately does not inspect Host or forwarded-host headers.
 */
export async function resolvePublicBookingContext(propertySlug = "nolmark-cdma-staynas") {
  if (!PUBLIC_BOOKING_PROPERTY_SLUGS.has(propertySlug)) {
    throw new BookingPropertyError("This property booking page is not published.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: property, error } = await supabaseAdmin
    .from("staynas_properties")
    .select("id, slug, name, currency, timezone, status")
    .eq("slug", propertySlug)
    .maybeSingle();

  if (error) {
    throw new BookingPropertyError("Unable to resolve the published booking property.");
  }
  if (!property || property.status !== "active") {
    throw new BookingPropertyError("This property is not available for online reservations.");
  }

  return { property, supabaseAdmin };
}
