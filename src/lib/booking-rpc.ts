import type { SupabaseClient } from "@supabase/supabase-js";

// Local contracts for the property-scoped booking RPCs defined in
// supabase/review/20261024090000_staynas_booking_property_isolation.sql.
// The generated database types are stale (they predate the property
// hardening), so — as with staynas-rpc.ts and housekeeping-rpc.ts — these
// contracts live here until the migration is applied and types regenerate.

type Result<T> = Promise<{ data: T | null; error: { message: string } | null }>;

export interface AvailabilityRow {
  room_id: string;
  slug: string;
  name: string;
  base_price: number;
  currency: string;
  capacity_adults: number;
  capacity_children: number;
  max_occupancy: number;
  nights: number;
  nightly_total: number;
  min_available: number;
  is_available: boolean;
}

export interface HoldCreatedRow {
  hold_id: string;
  expires_at: string;
  room_id: string;
}

export interface HoldSessionRow {
  id: string;
  room_id: string;
  check_in: string;
  check_out: string;
  expires_at: string;
  status: string;
}

export interface CreateBookingRow {
  booking_id: string;
  reference: string;
  total: number;
  currency: string;
}

export interface CreateBookingArgs {
  _room_slug: string;
  _check_in: string;
  _check_out: string;
  _adults: number;
  _children: number;
  _guest_name: string;
  _guest_email: string;
  _guest_phone: string | null;
  _country: string | null;
  _special_requests: string | null;
  _property_id: string;
  _extras: unknown;
  _children_below_6?: number;
  _children_7_plus?: number;
  _hold_id?: string | null;
  _session_id?: string | null;
}

export interface BookingPropertyRpc {
  rpc(fn: "staynas_booking_property_id", args: { _hostname: string }): Result<string>;
  rpc(
    fn: "get_room_availability_for_property",
    args: { _check_in: string; _check_out: string; _property_id: string },
  ): Result<AvailabilityRow[]>;
  rpc(
    fn: "create_booking_hold_for_property",
    args: {
      _room_slug: string;
      _check_in: string;
      _check_out: string;
      _session_id: string;
      _property_id: string;
      _guest_email?: string;
      _ttl_seconds?: number;
    },
  ): Result<HoldCreatedRow[]>;
  rpc(
    fn: "release_booking_hold_for_property",
    args: { _hold_id: string; _session_id: string; _property_id: string },
  ): Result<boolean>;
  rpc(
    fn: "get_booking_hold_for_property",
    args: { _hold_id: string; _session_id: string; _property_id: string },
  ): Result<HoldSessionRow[]>;
  rpc(fn: "create_booking_for_property", args: CreateBookingArgs): Result<CreateBookingRow[]>;
}

export function bookingRpc(client: SupabaseClient<any>): BookingPropertyRpc {
  return client as unknown as BookingPropertyRpc;
}
