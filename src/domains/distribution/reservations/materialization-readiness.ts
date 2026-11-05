import type { ExternalReservationEvent } from "./reservation-ingestion.contracts";

export type ReservationMappingReadiness = Readonly<{
  propertyResolved: boolean;
  roomResolved: boolean;
  ratePlanRequired: boolean;
  ratePlanResolved: boolean;
}>;

export type ReservationMaterializationDecision =
  | Readonly<{ kind: "ready" }>
  | Readonly<{
      kind: "manual_reconciliation";
      reasons: readonly (
        | "property_mapping_missing"
        | "room_mapping_missing"
        | "rate_plan_mapping_missing"
        | "guest_name_missing"
        | "guest_email_missing"
      )[];
    }>;

/**
 * DC-05 fail-closed gate before a provider event can create a canonical booking.
 * This deliberately does not invent guest identity or infer missing mappings.
 * The caller must resolve mappings from durable, property-scoped records.
 */
export function assessReservationMaterializationReadiness(
  event: ExternalReservationEvent,
  mappings: ReservationMappingReadiness,
): ReservationMaterializationDecision {
  const reasons: Array<
    | "property_mapping_missing"
    | "room_mapping_missing"
    | "rate_plan_mapping_missing"
    | "guest_name_missing"
    | "guest_email_missing"
  > = [];

  if (!mappings.propertyResolved) reasons.push("property_mapping_missing");
  if (!mappings.roomResolved) reasons.push("room_mapping_missing");
  if (mappings.ratePlanRequired && !mappings.ratePlanResolved) {
    reasons.push("rate_plan_mapping_missing");
  }

  const guestName = [event.guest.firstName, event.guest.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  if (guestName.length < 2) reasons.push("guest_name_missing");
  if (!event.guest.email?.trim()) reasons.push("guest_email_missing");

  return reasons.length
    ? { kind: "manual_reconciliation", reasons }
    : { kind: "ready" };
}
