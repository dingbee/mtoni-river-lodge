import { getRequestHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError, normalizeBookingHostname } from "./booking-property";

/**
 * Resolve booking scope from authenticated StayNas membership for staff.
 * Anonymous guest traffic is resolved from the server-observed Host header,
 * which must match a verified staynas_property_domains entry.
 *
 * Never accept a browser-supplied property ID as authority.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
): Promise<string> {
  const { data: authData, error: authError } = await sb.auth.getUser();

  if (!authError && authData.user) {
    const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id");
    if (error) {
      throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
    }
    if (!data) {
      throw new BookingPropertyError("Booking property is not configured");
    }
    return data;
  }

  const hostname = normalizeBookingHostname(getRequestHeader("host"));

  const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id", {
    _hostname: hostname,
  });
  if (error) {
    throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
  }
  if (!data) {
    throw new BookingPropertyError("Booking property is not configured for this hostname");
  }
  return data;
}
