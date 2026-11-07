import { z } from "zod";

export const distributionProviderIdSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9][a-z0-9._-]*$/i);
export const distributionOperationSchema = z.enum([
  "connection.validate",
  "rates.push",
  "availability.push",
  "restrictions.push",
  "reservations.pull",
  "reservations.receive",
  "reservations.modify",
  "reservations.cancel",
  "reconciliation.read",
]);

export const restrictionCapabilitySchema = z.enum([
  "closed_to_arrival",
  "closed_to_departure",
  "stop_sell",
  "min_los",
  "max_los",
  "advance_booking_min_hours",
  "advance_booking_max_days",
]);

export const providerCapabilitiesSchema = z.object({
  operations: z.array(distributionOperationSchema).refine((items) => new Set(items).size === items.length),
  restrictions: z.array(restrictionCapabilitySchema).default([]),
  supportsOccupancyPricing: z.boolean().default(false),
  supportsTaxBreakdown: z.boolean().default(false),
  supportsFeeBreakdown: z.boolean().default(false),
  supportsCurrencyConversion: z.boolean().default(false),
  reservationDelivery: z.enum(["webhook", "polling", "both", "none"]).default("none"),
  supportsEventVersioning: z.boolean().default(false),
  supportsExternalIdempotency: z.boolean().default(false),
});

export const distributionScopeSchema = z.object({
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

export const channelConnectionSchema = distributionScopeSchema.extend({
  provider: distributionProviderIdSchema,
  externalAccountId: z.string().trim().min(1).max(255),
  externalPropertyId: z.string().trim().min(1).max(255),
  status: z.enum(["draft", "validating", "active", "suspended", "revoked", "error"]),
  credentialReference: z.string().trim().min(1).max(255),
  mappingVersion: z.number().int().positive(),
});

export const distributionMappingSchema = distributionScopeSchema.extend({
  mappingType: z.enum(["room_type", "rate_plan"]),
  internalId: z.string().uuid(),
  externalId: z.string().trim().min(1).max(255),
  active: z.boolean(),
  version: z.number().int().positive(),
});

export const distributionRateSchema = z.object({
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid(),
  stayDate: z.string().date(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  occupancy: z.number().int().positive().max(20).nullable(),
  publicationId: z.string().uuid(),
  publicationNumber: z.number().int().positive(),
});

export const distributionAvailabilitySchema = z.object({
  roomTypeId: z.string().uuid(),
  stayDate: z.string().date(),
  totalUnits: z.number().int().nonnegative(),
  reservedUnits: z.number().int().nonnegative(),
  blockedUnits: z.number().int().nonnegative(),
  allocatedUnits: z.number().int().nonnegative(),
  stopSell: z.boolean(),
  sourceVersion: z.string().min(1).max(160),
}).superRefine((value, ctx) => {
  if (value.reservedUnits + value.blockedUnits + value.allocatedUnits > value.totalUnits) {
    ctx.addIssue({ code: "custom", path: ["allocatedUnits"], message: "Reserved, blocked and channel-allocated units exceed total inventory." });
  }
});

export const distributionRestrictionSchema = z.object({
  roomTypeId: z.string().uuid(),
  ratePlanId: z.string().uuid().nullable(),
  type: restrictionCapabilitySchema,
  startDate: z.string().date(),
  endDate: z.string().date(),
  value: z.number().int().nonnegative().nullable(),
  sourceVersion: z.string().min(1).max(160),
}).refine((value) => value.endDate >= value.startDate, {
  path: ["endDate"],
  message: "Restriction end date must not precede its start date.",
});

export const inboundReservationSchema = z.object({
  provider: distributionProviderIdSchema,
  externalAccountId: z.string().min(1).max(255),
  externalPropertyId: z.string().min(1).max(255),
  externalReservationId: z.string().min(1).max(255),
  eventId: z.string().min(1).max(255),
  eventVersion: z.string().max(160).nullable(),
  eventType: z.enum(["created", "modified", "cancelled"]),
  roomTypeExternalId: z.string().min(1).max(255),
  ratePlanExternalId: z.string().min(1).max(255).nullable(),
  arrivalDate: z.string().date(),
  departureDate: z.string().date(),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  guest: z.object({
    fullName: z.string().trim().min(2).max(200),
    email: z.string().email().max(255).nullable(),
    phone: z.string().max(50).nullable(),
  }),
  confirmedAmountMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  taxAmountMinor: z.number().int().nonnegative().nullable(),
  feeAmountMinor: z.number().int().nonnegative().nullable(),
  commissionAmountMinor: z.number().int().nonnegative().nullable(),
  paymentStatus: z.enum(["unknown", "unpaid", "paid", "partially_paid", "refunded"]).default("unknown"),
  rawPayloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
}).superRefine((value, ctx) => {
  if (value.departureDate <= value.arrivalDate) {
    ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure must be after arrival." });
  }
  if ((value.confirmedAmountMinor === null) !== (value.currency === null)) {
    ctx.addIssue({ code: "custom", path: ["currency"], message: "Confirmed amount and currency must either both be present or both be absent." });
  }
});

export type DistributionOperation = z.infer<typeof distributionOperationSchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;
export type DistributionScope = z.infer<typeof distributionScopeSchema>;
export type ChannelConnection = z.infer<typeof channelConnectionSchema>;
export type DistributionMapping = z.infer<typeof distributionMappingSchema>;
export type DistributionRate = z.infer<typeof distributionRateSchema>;
export type DistributionAvailability = z.infer<typeof distributionAvailabilitySchema>;
export type DistributionRestriction = z.infer<typeof distributionRestrictionSchema>;
export type InboundReservationEvent = z.infer<typeof inboundReservationSchema>;
