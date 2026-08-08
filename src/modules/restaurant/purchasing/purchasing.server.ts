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

/**
 * Document-centric read of one purchase order and everything that hangs off
 * it: ordered lines, what the supplier confirmed, what was actually received
 * and what we were invoiced. Read-only — no stage is collapsed into another.
 */
export async function getPurchaseOrderDetail(sb: Sb, userId: string, tenantId: string, id: string) {
  await assertTenantRead(sb, userId, tenantId);

  const { data: order, error } = await sb
    .from("restaurant_purchase_orders")
    .select(
      "id, reference, document_number, status, confirmation_status, confirmed_at, supplier_reference, supplier_id, property_id, location_id, order_date, expected_at, received_at, subtotal, total, currency, notes",
    )
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .single();
  if (error || !order) throw new Error("Purchase order not found.");

  const [
    { data: items },
    { data: supplier },
    { data: confirmations },
    { data: receipts },
    { data: invoices },
  ] = await Promise.all([
    sb
      .from("restaurant_purchase_order_items")
      .select("id, inventory_item_id, unit_id, description, quantity, unit_price, line_total")
      .eq("tenant_id", tenantId)
      .eq("purchase_order_id", id),
    order.supplier_id
      ? sb.from("restaurant_suppliers").select("id, name, code, payment_terms").eq("id", order.supplier_id).single()
      : Promise.resolve({ data: null }),
    sb
      .from("restaurant_supplier_confirmations")
      .select("id, status, supplier_reference, confirmed_delivery_date, notes, created_at")
      .eq("tenant_id", tenantId)
      .eq("purchase_order_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("restaurant_goods_receipts")
      .select("id, document_number, status, received_at, accepted_value, currency, delivery_note_ref")
      .eq("tenant_id", tenantId)
      .eq("purchase_order_id", id)
      .order("received_at", { ascending: false }),
    sb
      .from("restaurant_supplier_invoices")
      .select(
        "id, document_number, supplier_invoice_number, invoice_date, due_date, total, currency, status, match_status, payment_status",
      )
      .eq("tenant_id", tenantId)
      .eq("purchase_order_id", id)
      .order("invoice_date", { ascending: false }),
  ]);

  const confirmationIds = ((confirmations ?? []) as any[]).map((c) => c.id);
  const receiptIds = ((receipts ?? []) as any[]).map((r) => r.id);

  const [{ data: confirmationItems }, { data: receiptItems }] = await Promise.all([
    confirmationIds.length
      ? sb
          .from("restaurant_supplier_confirmation_items")
          .select(
            "id, confirmation_id, purchase_order_item_id, ordered_quantity, ordered_unit_price, confirmed_quantity, confirmed_unit_price, confirmed_delivery_date, notes",
          )
          .in("confirmation_id", confirmationIds)
      : Promise.resolve({ data: [] }),
    receiptIds.length
      ? sb
          .from("restaurant_goods_receipt_items")
          .select(
            "id, goods_receipt_id, purchase_order_item_id, description, ordered_quantity, received_quantity, accepted_quantity, rejected_quantity, unit_cost",
          )
          .in("goods_receipt_id", receiptIds)
      : Promise.resolve({ data: [] }),
  ]);

  const acceptedByOrderItem = new Map<string, number>();
  for (const r of (receiptItems ?? []) as any[]) {
    if (!r.purchase_order_item_id) continue;
    acceptedByOrderItem.set(
      r.purchase_order_item_id,
      (acceptedByOrderItem.get(r.purchase_order_item_id) ?? 0) + Number(r.accepted_quantity ?? 0),
    );
  }
  const latestConfirmation = ((confirmations ?? []) as any[])[0] ?? null;
  const confirmedByOrderItem = new Map<string, { quantity: number; unitPrice: number }>();
  for (const c of (confirmationItems ?? []) as any[]) {
    if (latestConfirmation && c.confirmation_id !== latestConfirmation.id) continue;
    confirmedByOrderItem.set(c.purchase_order_item_id, {
      quantity: Number(c.confirmed_quantity ?? 0),
      unitPrice: Number(c.confirmed_unit_price ?? 0),
    });
  }

  return {
    order,
    supplier: supplier ?? null,
    items: ((items ?? []) as any[]).map((i) => ({
      ...i,
      quantity: Number(i.quantity ?? 0),
      unit_price: Number(i.unit_price ?? 0),
      confirmed_quantity: confirmedByOrderItem.get(i.id)?.quantity ?? null,
      confirmed_unit_price: confirmedByOrderItem.get(i.id)?.unitPrice ?? null,
      accepted_quantity: acceptedByOrderItem.get(i.id) ?? 0,
    })),
    confirmations: (confirmations ?? []) as any[],
    confirmationItems: (confirmationItems ?? []) as any[],
    receipts: (receipts ?? []) as any[],
    receiptItems: (receiptItems ?? []) as any[],
    invoices: (invoices ?? []) as any[],
  };
}