import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError } from "./booking-property";

/**
 * Resolve the active property for an authenticated staff session only.
 * Public guest traffic must use resolvePublicBookingContext(), whose
 * server-owned publication allowlist does not inspect request host headers.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
): Promise<string> {
  const { data: authData, error: authError } = await sb.auth.getUser();
  if (authError || !authData.user) {
    throw new BookingPropertyError("An authenticated staff session is required to resolve a booking property.");
  }

  const { data, error } = await bookingRpc(sb).rpc("staynas_booking_property_id");
  if (error) {
    throw new BookingPropertyError(`Booking property resolution failed: ${error.message}`);
  }
  if (!data) {
    throw new BookingPropertyError("Booking property is not configured");
  }
  return data;
}
