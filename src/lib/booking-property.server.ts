import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError } from "./booking-property";

/**
 * Resolves the configured booking property for authenticated booking workflows.
 * This resolver deliberately requires the staff context and must not be used by
 * public, unauthenticated routes.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
): Promise<string> {
  const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id");
  if (error) {
    throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
  }
  if (!data) {
    throw new BookingPropertyError("Booking property is not configured");
  }
  return data;
}

/**
 * Resolves a public property from the request hostname. The database function
 * accepts only an exact verified domain with a published direct_web channel.
 * It never falls back to a staff session, a default property, or another tenant.
 */
export async function getPublicBookingPropertyId(
  sb: SupabaseClient<any>,
  hostname: string,
): Promise<string> {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (
    !normalizedHostname ||
    normalizedHostname.length > 253 ||
    !/^[a-z0-9.-]+$/.test(normalizedHostname)
  ) {
    throw new BookingPropertyError("Invalid public booking hostname");
  }

  const { data, error } = await bookingRpc(sb).rpc(
    "staynas_public_booking_property_id",
    { _hostname: normalizedHostname },
  );
  if (error) {
    console.error("[public booking] Hostname property resolver failed", { code: (error as any).code, message: error.message });
    throw new BookingPropertyError("Public booking is not configured for this domain");
  }
  if (!data) {
    throw new BookingPropertyError("No published direct booking channel is configured for this hostname");
  }
  return data;
}
