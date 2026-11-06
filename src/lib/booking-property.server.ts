import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError } from "./booking-property";

/**
 * Resolves the property from the inbound website hostname. The database
 * accepts only an exact, verified hostname mapped to an active property.
 * Authenticated staff resolve to their own selected property regardless of
 * the supplied hostname. Missing host context fails closed.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
): Promise<string> {
  const hostname = (getRequestHeader("host") ?? "").trim();
  if (!hostname) {
    throw new BookingPropertyError("Booking property resolution requires an inbound hostname");
  }
  const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id", {
    _hostname: hostname,
  });
  if (error) {
    throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
  }
  if (!data) {
    throw new BookingPropertyError("No active property is verified for this hostname");
  }
  return data;
}
