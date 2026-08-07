/**
 * Canonical Restaurant & Bar OS events.
 *
 * These are the *only* thing the Intelligence Core consumes from this module.
 * The envelope follows the existing intelligence event standard and adds the
 * commercial dimensions (tenant / property / location) every hospitality group
 * needs for segmentation.
 */
import { z } from "zod";

export const RESTAURANT_EVENT_TYPES = [
  "restaurant.menu.created",
  "restaurant.menu.updated",
  "restaurant.menu.published",
  "restaurant.item.sold",
  "restaurant.order.opened",
  "restaurant.order.closed",
  "restaurant.order.voided",
  "restaurant.payment.captured",
  "restaurant.kitchen.ticket.fired",
  "restaurant.kitchen.ticket.ready",
  "restaurant.kitchen.ticket.delayed",
  "restaurant.stock.moved",
  "restaurant.stock.transferred",
  "restaurant.profitability.computed",
  "restaurant.inventory.low",
  "restaurant.inventory.adjusted",
  "restaurant.purchase.created",
  "restaurant.purchase.requested",
  "restaurant.purchase.request.approved",
  "restaurant.purchase.request.rejected",
  "restaurant.purchase.order.created",
  "restaurant.purchase.order.confirmed",
  "restaurant.purchase.received",
  "restaurant.purchase.variance.detected",
  "restaurant.purchase.invoice.recorded",
  "restaurant.purchase.invoice.matched",
  "restaurant.recipe.updated",
  "restaurant.cost.changed",
  "restaurant.waste.recorded",
  "restaurant.shift.closed",
  "restaurant.daily.revenue.closed",
  "restaurant.supplier.updated",
] as const;
export type RestaurantEventType = (typeof RESTAURANT_EVENT_TYPES)[number];

/** Severity mirrors the intelligence severity scale. */
export const RESTAURANT_EVENT_SEVERITY: Record<RestaurantEventType, "info" | "low" | "medium" | "high"> = {
  "restaurant.menu.created": "info",
  "restaurant.menu.updated": "info",
  "restaurant.menu.published": "low",
  "restaurant.item.sold": "info",
  "restaurant.order.opened": "info",
  "restaurant.order.closed": "low",
  "restaurant.order.voided": "medium",
  "restaurant.payment.captured": "info",
  "restaurant.kitchen.ticket.fired": "info",
  "restaurant.kitchen.ticket.ready": "info",
  "restaurant.kitchen.ticket.delayed": "high",
  "restaurant.stock.moved": "info",
  "restaurant.stock.transferred": "low",
  "restaurant.profitability.computed": "medium",
  "restaurant.inventory.low": "high",
  "restaurant.inventory.adjusted": "low",
  "restaurant.purchase.created": "low",
  "restaurant.purchase.requested": "low",
  "restaurant.purchase.request.approved": "low",
  "restaurant.purchase.request.rejected": "medium",
  "restaurant.purchase.order.created": "low",
  "restaurant.purchase.order.confirmed": "low",
  "restaurant.purchase.received": "low",
  "restaurant.purchase.variance.detected": "high",
  "restaurant.purchase.invoice.recorded": "info",
  "restaurant.purchase.invoice.matched": "low",
  "restaurant.recipe.updated": "low",
  "restaurant.cost.changed": "medium",
  "restaurant.waste.recorded": "medium",
  "restaurant.shift.closed": "info",
  "restaurant.daily.revenue.closed": "low",
  "restaurant.supplier.updated": "info",
};

export const restaurantEventSchema = z.object({
  type: z.enum(RESTAURANT_EVENT_TYPES),
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().uuid().optional(),
  /** Free-form, event-specific body. Keep it flat and numeric where possible. */
  payload: z.record(z.string(), z.unknown()).default({}),
  source: z.string().max(60).default("restaurant-os"),
  occurredAt: z.string().datetime().optional(),
  correlationId: z.string().uuid().optional(),
  /** Idempotency. Derived when omitted. */
  dedupeKey: z.string().max(200).optional(),
});
export type RestaurantEventInput = z.infer<typeof restaurantEventSchema>;

/** Stable idempotency key: same fact never lands twice. */
export function restaurantDedupeKey(e: RestaurantEventInput): string {
  return (
    e.dedupeKey ??
    [
      e.type,
      e.tenantId,
      e.locationId ?? e.propertyId ?? "tenant",
      e.entityId ?? "none",
      e.occurredAt ?? new Date().toISOString().slice(0, 13),
    ].join(":")
  );
}