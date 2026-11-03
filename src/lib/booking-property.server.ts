import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingRpc } from "./booking-rpc";
import { BookingPropertyError } from "./booking-property";

/**
 * Staff actions must resolve the authenticated user's active tenant from
 * the middleware-verified user ID. Public booking paths omit userId and
 * resolve only from the verified request hostname.
 */
export async function getConfiguredBookingPropertyId(
  sb: SupabaseClient<any>,
  userId?: string,
): Promise<string> {
  if (userId) {
    const { data, error } = await sb.rpc("staynas_active_property_id", { _uid: userId });
    if (error || !data) {
      throw new BookingPropertyError(
        `Booking property resolution failed: ${error?.message ?? "No active property is assigned to this user"}`,
      );
    }
    const { data: allowed, error: accessError } = await sb.rpc(
      "staynas_user_has_property_access",
      { _uid: userId, _property_id: data },
    );
    if (accessError || !allowed) {
      throw new BookingPropertyError("Active booking property access denied");
    }
    return data;
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
