import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError } from "./booking-property";

/**
 * Resolves the single configured booking property via the
 * staynas_booking_property_id(_hostname) RPC (SECURITY DEFINER, granted to
 * anon/authenticated/service_role). Throws when the property is missing,
 * inactive, or the resolver fails — booking paths must never proceed
 * without an explicit property context.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
): Promise<string> {
  const hostname = process.env.STAYNAS_BOOKING_HOSTNAME?.trim().toLowerCase();
  if (!hostname) throw new BookingPropertyError("STAYNAS_BOOKING_HOSTNAME is not configured");
  const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id", { _hostname: hostname });
  if (error) {
    throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
  }
  if (!data) {
    throw new BookingPropertyError("Booking property is not configured");
  }
  return data;
}
