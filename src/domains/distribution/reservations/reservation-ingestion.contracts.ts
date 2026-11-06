import { z } from "zod";

export const reservationLifecycleEventSchema = z.enum([
  "reservation.created", "reservation.confirmed", "reservation.modified",
  "reservation.cancelled", "reservation.reinstated", "reservation.payment_updated",
  "reservation.refund_notified", "reservation.refund_reversed",
  "reservation.settlement_reported", "reservation.settlement_adjusted", "reservation.no_show",
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
  childrenBelow6: z.number().int().min(0).max(20).optional(),
  children7Plus: z.number().int().min(0).max(20).optional(),
  grossAmount: money.optional(),
  originalCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  taxes: money.optional(),
  fees: money.optional(),
  channelCommission: money.optional(),
  expectedSettlement: money.optional(),
  paymentAmount: money.optional(),
  paymentCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  paymentStatus: z.enum(["pending","authorized","captured","paid","failed","partially_refunded","refunded","reversed"]).optional(),
  paymentReference: z.string().trim().max(256).optional(),
  settlementReference: z.string().trim().max(256).optional(),
  settlementAmount: money.optional(),
  settlementCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  settlementAt: z.string().datetime({ offset: true }).optional(),
  settlementDueAt: z.string().datetime({ offset: true }).optional(),
  exchangeRate: z.number().finite().positive().max(1_000_000).optional(),
  settlementAdjustmentType: z.enum(["credit","debit"]).optional(),
  refundAmount: money.optional(),
  refundCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  refundReference: z.string().trim().max(256).optional(),
  refundAt: z.string().datetime({ offset: true }).optional(),
  refundReversalAmount: money.optional(),
  refundReversalReference: z.string().trim().max(256).optional(),
  cancellationReason: z.string().trim().max(500).optional(),
  cancellationAt: z.string().datetime({ offset: true }).optional(),
  providerPayloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).superRefine((event, ctx) => {
  if ((event.childrenBelow6 === undefined) !== (event.children7Plus === undefined)) {
    ctx.addIssue({ code: "custom", path: ["childrenBelow6"], message: "Both child age counts must be supplied together." });
  }
  if (event.childrenBelow6 !== undefined && event.children7Plus !== undefined &&
      event.childrenBelow6 + event.children7Plus !== event.children) {
    ctx.addIssue({ code: "custom", path: ["children"], message: "Child age counts must equal the total child count." });
  }
  if (event.departureDate <= event.arrivalDate) {
    ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure must be after arrival." });
  }
  const hasFinancialValues = event.grossAmount !== undefined || event.taxes !== undefined ||
    event.fees !== undefined || event.channelCommission !== undefined ||
    event.expectedSettlement !== undefined || event.paymentAmount !== undefined ||
    event.settlementAmount !== undefined || event.refundAmount !== undefined ||
    event.refundReversalAmount !== undefined || event.exchangeRate !== undefined;
  if (hasFinancialValues && !event.originalCurrency) {
    ctx.addIssue({ code: "custom", path: ["originalCurrency"], message: "Financial values require the provider's original currency." });
  }
  if (event.expectedSettlement !== undefined && event.grossAmount !== undefined &&
      event.expectedSettlement > event.grossAmount + (event.fees ?? 0)) {
    ctx.addIssue({ code: "custom", path: ["expectedSettlement"], message: "Expected settlement exceeds gross plus fees." });
  }
  if (event.paymentAmount !== undefined && event.paymentCurrency !== undefined &&
      event.paymentCurrency !== event.originalCurrency) {
    ctx.addIssue({ code: "custom", path: ["paymentCurrency"], message: "Provider payment notification currency must match the reservation's original currency." });
  }
  if ((event.settlementAmount !== undefined) !== (event.settlementCurrency !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["settlementCurrency"], message: "Settlement amount and currency must be supplied together." });
  }
  if (event.exchangeRate !== undefined && event.settlementAmount === undefined) {
    ctx.addIssue({ code: "custom", path: ["exchangeRate"], message: "Exchange rate requires settlement amount and currency evidence." });
  }
  if (event.refundAmount !== undefined && !event.refundCurrency) {
    ctx.addIssue({ code: "custom", path: ["refundCurrency"], message: "Refund amount requires its provider currency." });
  }
  if (event.refundReversalAmount !== undefined && (!event.refundReversalReference || !event.refundCurrency)) {
    ctx.addIssue({ code: "custom", path: ["refundReversalReference"], message: "Refund reversal requires its provider reference and currency." });
  }
  if (event.eventType === "reservation.payment_updated" && !event.paymentStatus) {
    ctx.addIssue({ code: "custom", path: ["paymentStatus"], message: "Payment notifications require a provider payment status." });
  }
  if (event.eventType === "reservation.settlement_reported" || event.eventType === "reservation.settlement_adjusted") {
    if (event.settlementAmount === undefined || !event.settlementReference) {
      ctx.addIssue({ code: "custom", path: ["settlementAmount"], message: "Settlement events require an amount and provider settlement reference." });
    }
    if (event.eventType === "reservation.settlement_adjusted" && !event.settlementAdjustmentType) {
      ctx.addIssue({ code: "custom", path: ["settlementAdjustmentType"], message: "Settlement adjustments require credit or debit direction." });
    }
  }
  if (event.eventType === "reservation.refund_notified" && (event.refundAmount === undefined || !event.refundReference)) {
    ctx.addIssue({ code: "custom", path: ["refundAmount"], message: "Refund notifications require amount and provider refund reference." });
  }
  if (event.eventType === "reservation.refund_reversed" &&
      (event.refundReversalAmount === undefined || !event.refundReversalReference)) {
    ctx.addIssue({ code: "custom", path: ["refundReversalAmount"], message: "Refund reversals require amount and provider reversal reference." });
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
    childrenBelow6: event.childrenBelow6 ?? null,
    children7Plus: event.children7Plus ?? null,
    providerPayloadFingerprint: event.providerPayloadFingerprint,
    privateFieldsPresent: Object.values(event.guest).some((value) => Boolean(value)),
    hasFinancialData: event.grossAmount !== undefined || event.taxes !== undefined ||
      event.fees !== undefined || event.channelCommission !== undefined ||
      event.expectedSettlement !== undefined || event.paymentAmount !== undefined ||
      event.paymentReference !== undefined || event.settlementReference !== undefined ||
      event.settlementAmount !== undefined || event.exchangeRate !== undefined ||
      event.refundAmount !== undefined || event.refundReversalAmount !== undefined,
  };
}
