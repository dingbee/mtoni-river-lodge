import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError } from "./booking-property";

/**
 * Resolves tenant context from the incoming hostname using the verified
 * staynas_property_domains registry. Hostnames not explicitly verified for
 * an active property fail closed; never fall back to a hard-coded property.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
): Promise<string> {
  const rawHost = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? "";
  const hostname = rawHost.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!hostname) {
    throw new BookingPropertyError("Property hostname is missing");
  }

  const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id", {
    _hostname: hostname,
  });
  if (error) {
    throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
  }
  if (!data) {
    throw new BookingPropertyError("No active property is configured for this hostname");
  }
  return data;
}
