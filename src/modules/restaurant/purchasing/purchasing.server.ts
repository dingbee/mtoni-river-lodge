/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
import { z } from "zod";
import {
  listPurchaseOrdersSchema,
  transitionPurchaseOrderSchema,
  type CreatePurchaseOrderInput,
} from "../core/contracts";
import { assertCapability, assertTenantRead } from "../core/access.server";
import { emitRestaurantEvent } from "../events/emit.server";

type Sb = any;

export async function listPurchaseOrders(
  sb: Sb,
  userId: string,
  input: z.infer<typeof listPurchaseOrdersSchema>,
) {
  await assertTenantRead(sb, userId, input.tenantId);
  let q = sb
    .from("restaurant_purchase_orders")
    .select("id, reference, status, supplier_id, order_date, expected_at, received_at, subtotal, total, currency, location_id")
    .eq("tenant_id", input.tenantId)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.propertyId) q = q.eq("property_id", input.propertyId);
  if (input.locationId) q = q.eq("location_id", input.locationId);
  if (input.status) q = q.eq("status", input.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPurchaseOrder(sb: Sb, userId: string, input: CreatePurchaseOrderInput) {
  await assertCapability(sb, userId, input.tenantId, "purchasing.manage");

  const subtotal = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const reference =
    input.reference ?? `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const { data: po, error } = await sb
    .from("restaurant_purchase_orders")
    .insert({
      tenant_id: input.tenantId,
      property_id: input.propertyId ?? null,
      location_id: input.locationId ?? null,
      supplier_id: input.supplierId ?? null,
      reference,
      status: "draft",
      expected_at: input.expectedAt ?? null,
      subtotal,
      total: subtotal,
      currency: input.currency,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select("id, reference, total, currency")
    .single();
  if (error) throw new Error(error.message);

  if (input.lines.length > 0) {
    const { error: lineError } = await sb.from("restaurant_purchase_order_items").insert(
      input.lines.map((l) => ({
        tenant_id: input.tenantId,
        purchase_order_id: po.id,
        inventory_item_id: l.inventoryItemId ?? null,
        supplier_product_id: l.supplierProductId ?? null,
        unit_id: l.unitId ?? null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.quantity * l.unitPrice,
      })),
    );
    if (lineError) throw new Error(lineError.message);
  }

  await emitRestaurantEvent(sb, userId, {
    type: "restaurant.purchase.created",
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    locationId: input.locationId,
    entityType: "restaurant_purchase_order",
    entityId: po.id,
    source: "restaurant-os",
    payload: { reference: po.reference, total: Number(po.total), lines: input.lines.length },
  });
  return po;
}

export async function transitionPurchaseOrder(
  sb: Sb,
  userId: string,
  input: z.infer<typeof transitionPurchaseOrderSchema>,
) {
  const capability = input.status === "approved" ? "purchasing.approve" : "purchasing.manage";
  await assertCapability(sb, userId, input.tenantId, capability);

  const patch: Record<string, unknown> = { status: input.status, updated_at: new Date().toISOString() };
  if (input.status === "approved") {
    patch.approved_by = userId;
    patch.approved_at = new Date().toISOString();
  }
  if (input.status === "received") patch.received_at = new Date().toISOString();

  const { data, error } = await sb
    .from("restaurant_purchase_orders")
    .update(patch)
    .eq("id", input.id)
    .eq("tenant_id", input.tenantId)
    .select("id, reference, status, total, location_id, property_id")
    .single();
  if (error) throw new Error(error.message);

  if (input.status === "received") {
    await emitRestaurantEvent(sb, userId, {
      type: "restaurant.purchase.received",
      tenantId: input.tenantId,
      propertyId: data.property_id ?? undefined,
      locationId: data.location_id ?? undefined,
      entityType: "restaurant_purchase_order",
      entityId: data.id,
      source: "restaurant-os",
      payload: { reference: data.reference, total: Number(data.total) },
    });
  }
  return data;
}