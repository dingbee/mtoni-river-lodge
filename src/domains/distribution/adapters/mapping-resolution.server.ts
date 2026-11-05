import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AdapterExecutionContext } from "./contracts";
import {
  resolveReservationDistributionMappings,
  type ReservationMappingResolution,
} from "./mapping-resolution";
import type { ExternalReservationEvent } from "../reservations/reservation-ingestion.contracts";

type ScopedMappingRow = Record<string, unknown>;

async function loadSingleMapping(
  table: string,
  context: AdapterExecutionContext,
  externalColumn: string,
  externalId: string | undefined,
): Promise<ScopedMappingRow | null> {
  if (!externalId) return null;
  const { data, error } = await (supabaseAdmin as any)
    .from(table)
    .select("*")
    .eq("organisation_id", context.organisationId)
    .eq("property_id", context.propertyId)
    .eq("connection_id", context.connectionId)
    .eq(externalColumn, externalId)
    .maybeSingle();
  if (error) throw new Error("Distribution mapping lookup failed.");
  return data as ScopedMappingRow | null;
}

/** Loads mappings only inside the server-resolved tenant/property/connection scope. */
export async function resolvePersistedReservationMappings(
  context: AdapterExecutionContext,
  event: ExternalReservationEvent,
): Promise<ReservationMappingResolution> {
  if (event.providerKey !== context.providerKey ||
      event.externalAccountReference !== context.externalAccountReference) {
    throw new Error("Reservation event does not match the trusted distribution connection.");
  }

  const [listing, room, ratePlan] = await Promise.all([
    loadSingleMapping("staynas_distribution_listing_mappings", context, "external_listing_id", event.externalListingId),
    loadSingleMapping("staynas_distribution_room_mappings", context, "external_room_id", event.externalRoomId),
    loadSingleMapping("staynas_distribution_rate_plan_mappings", context, "external_rate_plan_id", event.externalRatePlanId),
  ]);

  const scope = {
    organisationId: context.organisationId,
    propertyId: context.propertyId,
    connectionId: context.connectionId,
  };
  return resolveReservationDistributionMappings(event, scope, {
    listings: listing ? [{
      ...scope,
      externalListingId: String(listing.external_listing_id),
      internalRoomTypeId: String(listing.internal_room_type_id),
      mappingStatus: listing.mapping_status as "pending" | "active" | "disabled",
    }] : [],
    rooms: room ? [{
      ...scope,
      externalRoomId: String(room.external_room_id),
      internalRoomTypeId: String(room.internal_room_type_id),
      mappingStatus: room.mapping_status as "pending" | "active" | "disabled",
    }] : [],
    ratePlans: ratePlan ? [{
      ...scope,
      externalRatePlanId: String(ratePlan.external_rate_plan_id),
      internalRatePlanId: String(ratePlan.internal_rate_plan_id),
      mappingStatus: ratePlan.mapping_status as "pending" | "active" | "disabled",
    }] : [],
  });
}
