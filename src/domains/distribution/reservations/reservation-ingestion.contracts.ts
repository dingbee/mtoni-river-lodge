import { z } from "zod";

export const reservationLifecycleEventSchema = z.enum([
  "reservation.created", "reservation.confirmed", "reservation.modified",
  "reservation.cancelled", "reservation.reinstated", "reservation.payment_updated",
  "reservation.refund_notified", "reservation.no_show",
]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Date must be a real calendar date.");
const money = z.number().finite().nonnegative().max(1_000_000_000);

export const externalReservationSchema = z.object({
  providerKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  externalAccountReference: z.string().trim().min(1).max(256),
  externalReservationId: z.string().trim().min(1).max(256),
  externalListingId: z.string().trim().min(1).max(256),
  externalRoomId: z.string().trim().min(1).max(256).optional(),
  externalRatePlanId: z.string().trim().min(1).max(256).optional(),
  providerEventId: z.string().trim().min(1).max(256),
  eventType: reservationLifecycleEventSchema,
  providerStatus: z.string().trim().min(1).max(64),
  providerCreatedAt: z.string().datetime({ offset: true }).optional(),
  providerModifiedAt: z.string().datetime({ offset: true }).optional(),
  guest: z.object({
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    email: z.string().email().max(255).optional(),
    phone: z.string().trim().max(40).optional(),
    country: z.string().trim().max(100).optional(),
  }).default({}),
  arrivalDate: isoDate,
  departureDate: isoDate,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
  grossAmount: money.optional(),
  originalCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  taxes: money.optional(),
  fees: money.optional(),
  channelCommission: money.optional(),
  expectedSettlement: money.optional(),
  paymentReference: z.string().trim().max(256).optional(),
  settlementReference: z.string().trim().max(256).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
  cancellationAt: z.string().datetime({ offset: true }).optional(),
  providerPayloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((event, ctx) => {
  if (event.departureDate <= event.arrivalDate) {
    ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure must be after arrival." });
  }
  if ((event.grossAmount !== undefined || event.taxes !== undefined || event.fees !== undefined ||
       event.channelCommission !== undefined || event.expectedSettlement !== undefined) && !event.originalCurrency) {
    ctx.addIssue({ code: "custom", path: ["originalCurrency"], message: "Financial values require the provider's original currency." });
  }
  if (event.expectedSettlement !== undefined && event.grossAmount !== undefined &&
      event.expectedSettlement > event.grossAmount + (event.fees ?? 0)) {
    ctx.addIssue({ code: "custom", path: ["expectedSettlement"], message: "Expected settlement exceeds gross plus fees." });
  }
});

export type ExternalReservationEvent = z.infer<typeof externalReservationSchema>;
export type ReservationProviderState = Readonly<{
  providerStatus: string;
  providerModifiedAt: string | null;
  providerEventId: string;
}>;

/** Without provider modification timestamps, event IDs are opaque and cannot establish ordering. */
export function isNewerProviderEvent(
  incoming: ReservationProviderState,
  current: ReservationProviderState | null,
): boolean {
  if (!current) return true;
  const incomingTime = incoming.providerModifiedAt ? Date.parse(incoming.providerModifiedAt) : Number.NaN;
  const currentTime = current.providerModifiedAt ? Date.parse(current.providerModifiedAt) : Number.NaN;
  if (Number.isFinite(incomingTime) && Number.isFinite(currentTime)) return incomingTime > currentTime;
  if (Number.isFinite(incomingTime) && !Number.isFinite(currentTime)) return true;
  return false;
}

export function toSafeReservationEventEnvelope(event: ExternalReservationEvent): Record<string, unknown> {
  return {
    schemaVersion: 1,
    eventType: event.eventType,
    externalReservationId: event.externalReservationId,
    externalListingId: event.externalListingId,
    externalRoomId: event.externalRoomId ?? null,
    externalRatePlanId: event.externalRatePlanId ?? null,
    providerStatus: event.providerStatus,
    providerCreatedAt: event.providerCreatedAt ?? null,
    providerModifiedAt: event.providerModifiedAt ?? null,
    arrivalDate: event.arrivalDate,
    departureDate: event.departureDate,
    adults: event.adults,
    children: event.children,
    providerPayloadFingerprint: event.providerPayloadFingerprint,
    privateFieldsPresent: Boolean(event.guest.email || event.guest.phone),
    hasFinancialData: event.grossAmount !== undefined || event.taxes !== undefined ||
      event.fees !== undefined || event.channelCommission !== undefined || event.expectedSettlement !== undefined,
  };
}
