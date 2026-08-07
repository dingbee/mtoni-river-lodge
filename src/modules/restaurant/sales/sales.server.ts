/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Sales & POS foundation.
 *
 * An order is the operational fact the Intelligence Core reasons over: what was
 * sold, when, in which service period, at what price and at what actual cost.
 * Closing an order is the only place stock consumption is triggered, so revenue
 * and cost always originate from the same event.
 */
import { z } from "zod";
import type {
  AddOrderItemsInput,
  CreateOrderInput,
  OrderLineInput,
  RecordPaymentInput,
  TransitionOrderInput,
  listOrdersSchema,
  listServicePeriodsSchema,
  listTablesSchema,
  upsertServicePeriodSchema,
  upsertTableSchema,
} from "../core/contracts";
import { assertCapability, assertTenantRead } from "../core/access.server";
import { emitRestaurantEvent } from "../events/emit.server";
import { consumeForOrderItem } from "../inventory/movements.server";

type Sb = any;

function reference(prefix: string) {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/* ---------------- Service periods ---------------- */

export async function listServicePeriods(sb: Sb, userId: string, input: z.infer<typeof listServicePeriodsSchema>) {
  await assertTenantRead(sb, userId, input.tenantId);
  let q = sb
    .from("restaurant_service_periods")
    .select("id, code, name, start_time, end_time, sort_order, active, location_id")
    .eq("tenant_id", input.tenantId)
    .order("sort_order");
  if (input.locationId) q = q.eq("location_id", input.locationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertServicePeriod(
  sb: Sb,
  userId: string,
  input: z.infer<typeof upsertServicePeriodSchema>,
) {
  await assertCapability(sb, userId, input.tenantId, "location.manage");
  const row = {
    tenant_id: input.tenantId,
    property_id: input.propertyId ?? null,
    location_id: input.locationId ?? null,
    code: input.code,
    name: input.name,
    start_time: input.startTime,
    end_time: input.endTime,
    sort_order: input.sortOrder,
    active: input.active,
  };
  const q = input.id
    ? sb.from("restaurant_service_periods").update(row).eq("id", input.id).eq("tenant_id", input.tenantId)
    : sb.from("restaurant_service_periods").insert(row);
  const { data, error } = await q.select("id, code, name").single();
  if (error) throw new Error(error.message);
  return data;
}

/* ---------------- Tables ---------------- */

export async function listTables(sb: Sb, userId: string, input: z.infer<typeof listTablesSchema>) {
  await assertTenantRead(sb, userId, input.tenantId);
  let q = sb
    .from("restaurant_tables")
    .select("id, code, name, zone, seats, status, active, location_id")
    .eq("tenant_id", input.tenantId)
    .order("code");
  if (input.locationId) q = q.eq("location_id", input.locationId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertTable(sb: Sb, userId: string, input: z.infer<typeof upsertTableSchema>) {
  await assertCapability(sb, userId, input.tenantId, "location.manage");
  const row = {
    tenant_id: input.tenantId,
    property_id: input.propertyId ?? null,
    location_id: input.locationId ?? null,
    code: input.code,
    name: input.name,
    zone: input.zone ?? null,
    seats: input.seats,
    status: input.status,
    active: input.active,
  };
  const q = input.id
    ? sb.from("restaurant_tables").update(row).eq("id", input.id).eq("tenant_id", input.tenantId)
    : sb.from("restaurant_tables").insert(row);
  const { data, error } = await q.select("id, code, name, status").single();
  if (error) throw new Error(error.message);
  return data;
}

/* ---------------- Orders ---------------- */

export async function listOrders(sb: Sb, userId: string, input: z.infer<typeof listOrdersSchema>) {
  await assertTenantRead(sb, userId, input.tenantId);
  let q = sb
    .from("restaurant_orders")
    .select(
      "id, order_number, order_type, status, payment_state, guest_count, guest_name, table_id, location_id, opened_at, closed_at, subtotal, total, paid_total, cost_total, currency",
    )
    .eq("tenant_id", input.tenantId)
    .order("opened_at", { ascending: false })
    .limit(input.limit);
  if (input.locationId) q = q.eq("location_id", input.locationId);
  if (input.propertyId) q = q.eq("property_id", input.propertyId);
  if (input.status) q = q.eq("status", input.status);
  if (input.paymentState) q = q.eq("payment_state", input.paymentState);
  if (input.from) q = q.gte("opened_at", input.from);
  if (input.to) q = q.lte("opened_at", input.to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getOrder(sb: Sb, userId: string, input: { tenantId: string; orderId: string }) {
  await assertTenantRead(sb, userId, input.tenantId);
  const [{ data: order, error }, { data: items }, { data: payments }, { data: tickets }] = await Promise.all([
    sb.from("restaurant_orders").select("*").eq("tenant_id", input.tenantId).eq("id", input.orderId).single(),
    sb
      .from("restaurant_order_items")
      .select("id, menu_item_id, station_id, description, quantity, unit_price, discount, tax_amount, line_total, unit_cost, line_cost, status, course, notes")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId)
      .order("created_at"),
    sb
      .from("restaurant_payments")
      .select("id, method, state, amount, currency, reference, captured_at")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId)
      .order("captured_at"),
    sb
      .from("restaurant_kitchen_tickets")
      .select("id, ticket_number, station_id, status, queued_at, started_at, ready_at, served_at, prep_seconds, delay_seconds, is_delayed, target_minutes")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId)
      .order("queued_at"),
  ]);
  if (error || !order) throw new Error("Order not found.");
  return { order, items: items ?? [], payments: payments ?? [], tickets: tickets ?? [] };
}

/** Theoretical cost per unit, taken from the most recent recipe costing run. */
async function unitCostsForMenuItems(sb: Sb, tenantId: string, menuItemIds: string[]) {
  const map = new Map<string, number>();
  if (menuItemIds.length === 0) return map;
  const { data } = await sb
    .from("restaurant_recipe_costs")
    .select("menu_item_id, total_cost, computed_at")
    .eq("tenant_id", tenantId)
    .in("menu_item_id", menuItemIds)
    .order("computed_at", { ascending: false });
  for (const row of ((data ?? []) as any[])) {
    if (!map.has(row.menu_item_id)) map.set(row.menu_item_id, Number(row.total_cost ?? 0));
  }
  return map;
}

function lineTotals(l: OrderLineInput) {
  const gross = l.quantity * l.unitPrice;
  return Number((gross - l.discount + l.taxAmount).toFixed(2));
}

async function insertLines(
  sb: Sb,
  tenantId: string,
  orderId: string,
  lines: OrderLineInput[],
) {
  const ids = lines.map((l) => l.menuItemId).filter(Boolean) as string[];
  const costs = await unitCostsForMenuItems(sb, tenantId, ids);
  const rows = lines.map((l) => {
    const unitCost = l.menuItemId ? (costs.get(l.menuItemId) ?? 0) : 0;
    return {
      tenant_id: tenantId,
      order_id: orderId,
      menu_item_id: l.menuItemId ?? null,
      station_id: l.stationId ?? null,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount: l.discount,
      tax_amount: l.taxAmount,
      line_total: lineTotals(l),
      unit_cost: unitCost,
      line_cost: Number((unitCost * l.quantity).toFixed(4)),
      course: l.course ?? null,
      notes: l.notes ?? null,
      status: "ordered",
    };
  });
  const { data, error } = await sb.from("restaurant_order_items").insert(rows).select("id, line_total, line_cost");
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
}

/** Recomputes money + cost on the order header from its own lines. */
async function recalcOrder(sb: Sb, tenantId: string, orderId: string) {
  const [{ data: items }, { data: payments }] = await Promise.all([
    sb.from("restaurant_order_items").select("line_total, line_cost, status").eq("tenant_id", tenantId).eq("order_id", orderId),
    sb.from("restaurant_payments").select("amount, state").eq("tenant_id", tenantId).eq("order_id", orderId),
  ]);
  const live = ((items ?? []) as any[]).filter((i) => i.status !== "voided");
  const subtotal = live.reduce((s, i) => s + Number(i.line_total ?? 0), 0);
  const cost = live.reduce((s, i) => s + Number(i.line_cost ?? 0), 0);
  const paid = ((payments ?? []) as any[])
    .filter((p) => p.state !== "refunded")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const paymentState =
    paid <= 0 ? "unpaid" : paid + 0.01 < subtotal ? "partially_paid" : "paid";

  const { data, error } = await sb
    .from("restaurant_orders")
    .update({
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(subtotal.toFixed(2)),
      cost_total: Number(cost.toFixed(4)),
      paid_total: Number(paid.toFixed(2)),
      payment_state: paymentState,
    })
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .select("id, order_number, subtotal, total, paid_total, cost_total, payment_state, currency, location_id, property_id, status")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createOrder(sb: Sb, userId: string, input: CreateOrderInput) {
  await assertCapability(sb, userId, input.tenantId, "sales.manage");

  const { data: order, error } = await sb
    .from("restaurant_orders")
    .insert({
      tenant_id: input.tenantId,
      property_id: input.propertyId ?? null,
      location_id: input.locationId ?? null,
      table_id: input.tableId ?? null,
      service_period_id: input.servicePeriodId ?? null,
      order_number: reference("ORD"),
      order_type: input.orderType,
      status: "open",
      guest_count: input.guestCount,
      guest_name: input.guestName ?? null,
      booking_id: input.bookingId ?? null,
      currency: input.currency,
      source: input.source,
      external_ref: input.externalRef ?? null,
      notes: input.notes ?? null,
      server_user_id: userId,
      created_by: userId,
    })
    .select("id, order_number, currency")
    .single();
  if (error) throw new Error(error.message);

  if (input.lines.length > 0) await insertLines(sb, input.tenantId, order.id, input.lines);
  if (input.tableId) {
    await sb.from("restaurant_tables").update({ status: "occupied" }).eq("id", input.tableId).eq("tenant_id", input.tenantId);
  }
  const totals = await recalcOrder(sb, input.tenantId, order.id);

  await emitRestaurantEvent(sb, userId, {
    type: "restaurant.order.opened",
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    locationId: input.locationId,
    entityType: "restaurant_order",
    entityId: order.id,
    source: "restaurant-os",
    payload: {
      order_number: order.order_number,
      order_type: input.orderType,
      covers: input.guestCount,
      lines: input.lines.length,
      total: Number(totals.total),
    },
  });
  return { ...order, ...totals };
}

export async function addOrderItems(sb: Sb, userId: string, input: AddOrderItemsInput) {
  await assertCapability(sb, userId, input.tenantId, "sales.manage");
  const { data: order } = await sb
    .from("restaurant_orders")
    .select("id, status")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .single();
  if (!order) throw new Error("Order not found.");
  if (["closed", "cancelled", "voided"].includes(order.status)) {
    throw new Error("This order is closed and can no longer be modified.");
  }
  await insertLines(sb, input.tenantId, input.orderId, input.lines);
  return recalcOrder(sb, input.tenantId, input.orderId);
}

export async function recordPayment(sb: Sb, userId: string, input: RecordPaymentInput) {
  await assertCapability(sb, userId, input.tenantId, "sales.manage");
  const { data: payment, error } = await sb
    .from("restaurant_payments")
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      method: input.method,
      state: input.state,
      amount: input.amount,
      tendered: input.tendered ?? null,
      change_due: input.tendered != null ? Math.max(0, Number((input.tendered - input.amount).toFixed(2))) : 0,
      reference: input.reference ?? null,
      booking_id: input.bookingId ?? null,
      created_by: userId,
    })
    .select("id, amount, method, state")
    .single();
  if (error) throw new Error(error.message);

  const totals = await recalcOrder(sb, input.tenantId, input.orderId);
  if (input.state === "room_charged" || input.state === "comped") {
    await sb
      .from("restaurant_orders")
      .update({ payment_state: input.state })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId);
  }

  await emitRestaurantEvent(sb, userId, {
    type: "restaurant.payment.captured",
    tenantId: input.tenantId,
    locationId: totals.location_id ?? undefined,
    entityType: "restaurant_order",
    entityId: input.orderId,
    source: "restaurant-os",
    payload: { method: input.method, amount: input.amount, state: input.state, order_total: Number(totals.total) },
  });
  return { payment, order: totals };
}

/**
 * Closing an order is the commercial commit point:
 * consume recipe ingredients → record actual cost → publish sales facts.
 */
export async function transitionOrder(sb: Sb, userId: string, input: TransitionOrderInput) {
  await assertCapability(sb, userId, input.tenantId, "sales.manage");

  const { data: order } = await sb
    .from("restaurant_orders")
    .select("id, order_number, status, table_id, location_id, property_id, service_period_id, order_type, guest_count, currency")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .single();
  if (!order) throw new Error("Order not found.");
  if (order.status === input.status) return order;
  if (["closed", "cancelled", "voided"].includes(order.status)) {
    throw new Error(`Order ${order.order_number} is already ${order.status}.`);
  }

  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "closed") patch.closed_at = new Date().toISOString();
  if (input.reason) patch.notes = input.reason;

  const { data: updated, error } = await sb
    .from("restaurant_orders")
    .update(patch)
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .select("id, order_number, status, total, cost_total, currency, closed_at")
    .single();
  if (error) throw new Error(error.message);

  if (input.status === "closed") {
    const { data: items } = await sb
      .from("restaurant_order_items")
      .select("id, menu_item_id, description, quantity, unit_price, line_total, line_cost, status")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId);

    let actualCost = 0;
    for (const item of ((items ?? []) as any[]).filter((i) => i.status !== "voided")) {
      actualCost += await consumeForOrderItem(sb, userId, {
        tenantId: input.tenantId,
        propertyId: order.property_id,
        locationId: order.location_id,
        orderId: order.id,
        orderItemId: item.id,
        menuItemId: item.menu_item_id,
        quantity: Number(item.quantity),
        occurredAt: new Date().toISOString(),
      });

      await emitRestaurantEvent(sb, userId, {
        type: "restaurant.item.sold",
        tenantId: input.tenantId,
        propertyId: order.property_id ?? undefined,
        locationId: order.location_id ?? undefined,
        entityType: "restaurant_menu_item",
        entityId: item.menu_item_id ?? undefined,
        source: "restaurant-os",
        payload: {
          order_id: order.id,
          description: item.description,
          quantity: Number(item.quantity),
          revenue: Number(item.line_total ?? 0),
          theoretical_cost: Number(item.line_cost ?? 0),
        },
        dedupeKey: `sold:${item.id}`,
      });
    }

    if (actualCost > 0) {
      await sb
        .from("restaurant_orders")
        .update({ cost_total: Number(actualCost.toFixed(4)) })
        .eq("tenant_id", input.tenantId)
        .eq("id", input.orderId);
    }
    if (order.table_id) {
      await sb.from("restaurant_tables").update({ status: "cleaning" }).eq("id", order.table_id).eq("tenant_id", input.tenantId);
    }

    await emitRestaurantEvent(sb, userId, {
      type: "restaurant.order.closed",
      tenantId: input.tenantId,
      propertyId: order.property_id ?? undefined,
      locationId: order.location_id ?? undefined,
      entityType: "restaurant_order",
      entityId: order.id,
      source: "restaurant-os",
      payload: {
        order_number: order.order_number,
        order_type: order.order_type,
        covers: order.guest_count,
        revenue: Number(updated.total ?? 0),
        actual_cost: Number(actualCost.toFixed(4)),
      },
      dedupeKey: `order-closed:${order.id}`,
    });
    return { ...updated, cost_total: Number(actualCost.toFixed(4)) };
  }

  if (input.status === "voided" || input.status === "cancelled") {
    await emitRestaurantEvent(sb, userId, {
      type: "restaurant.order.voided",
      tenantId: input.tenantId,
      propertyId: order.property_id ?? undefined,
      locationId: order.location_id ?? undefined,
      entityType: "restaurant_order",
      entityId: order.id,
      source: "restaurant-os",
      payload: { order_number: order.order_number, reason: input.reason ?? null },
    });
  }
  return updated;
}
