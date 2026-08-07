/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Supplier invoices and three-way matching.
 *
 * Match = purchase order (what we agreed to buy)
 *       + goods receipt (what we accepted)
 *       + invoice        (what we are being billed for)
 *
 * The system reports the match; it never silently approves a mismatch.
 */
import type { z } from "zod";
import { assertCapability, assertTenantRead } from "../core/access.server";
import { emitRestaurantEvent } from "../events/emit.server";
import { nextDocumentNumber, recordProcurementAudit } from "./audit.server";
import { recordPriceObservation } from "./pricing.server";
import { raiseVariance } from "./variances.server";
import {
  DOCUMENT_PREFIX,
  type RecordInvoiceInput,
  type listInvoicesSchema,
  type setInvoicePaymentStatusSchema,
} from "./contracts";

type Sb = any;

const INVOICE_SELECT =
  "id, document_number, supplier_invoice_number, supplier_id, purchase_order_id, status, payment_status, match_status, matched_at, invoice_date, due_date, currency, subtotal, tax_total, total, amount_paid, attachment_url, notes, created_at";

export async function listSupplierInvoices(sb: Sb, userId: string, input: z.infer<typeof listInvoicesSchema>) {
  await assertTenantRead(sb, userId, input.tenantId);
  let q = sb
    .from("restaurant_supplier_invoices")
    .select(INVOICE_SELECT)
    .eq("tenant_id", input.tenantId)
    .order("invoice_date", { ascending: false })
    .limit(input.limit);
  if (input.supplierId) q = q.eq("supplier_id", input.supplierId);
  if (input.status) q = q.eq("status", input.status);
  if (input.paymentStatus) q = q.eq("payment_status", input.paymentStatus);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const { data: suppliers } = await sb
    .from("restaurant_suppliers")
    .select("id, name")
    .eq("tenant_id", input.tenantId);
  const names = new Map(((suppliers ?? []) as any[]).map((s) => [s.id, s.name]));
  return ((data ?? []) as any[]).map((i) => ({ ...i, supplier_name: names.get(i.supplier_id) ?? "—" }));
}

export async function recordSupplierInvoice(sb: Sb, userId: string, input: RecordInvoiceInput) {
  await assertCapability(sb, userId, input.tenantId, "invoice.manage");

  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxTotal = input.taxTotal || input.lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0);
  const total = subtotal + taxTotal;

  const documentNumber = await nextDocumentNumber(
    sb,
    input.tenantId,
    "supplier_invoice",
    DOCUMENT_PREFIX.supplier_invoice,
  );

  const { data: invoice, error } = await sb
    .from("restaurant_supplier_invoices")
    .insert({
      tenant_id: input.tenantId,
      property_id: input.propertyId ?? null,
      location_id: input.locationId ?? null,
      supplier_id: input.supplierId,
      purchase_order_id: input.purchaseOrderId ?? null,
      document_number: documentNumber,
      supplier_invoice_number: input.supplierInvoiceNumber,
      status: "recorded",
      payment_status: "unpaid",
      match_status: "unmatched",
      invoice_date: input.invoiceDate,
      due_date: input.dueDate ?? null,
      currency: input.currency,
      subtotal,
      tax_total: taxTotal,
      total,
      amount_paid: 0,
      attachment_url: input.attachmentUrl ?? null,
      notes: input.notes ?? null,
      recorded_by: userId,
    })
    .select("id, document_number, total")
    .single();
  if (error) {
    if (String(error.code) === "23505") {
      throw new Error("This supplier invoice number has already been recorded for this supplier.");
    }
    throw new Error(error.message);
  }

  if (input.lines.length > 0) {
    const { error: lErr } = await sb.from("restaurant_supplier_invoice_items").insert(
      input.lines.map((l) => ({
        tenant_id: input.tenantId,
        invoice_id: invoice.id,
        purchase_order_item_id: l.purchaseOrderItemId ?? null,
        receipt_item_id: l.receiptItemId ?? null,
        inventory_item_id: l.inventoryItemId ?? null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        tax_amount: l.taxAmount ?? 0,
        line_total: l.quantity * l.unitPrice + (l.taxAmount ?? 0),
      })),
    );
    if (lErr) throw new Error(lErr.message);

    for (const l of input.lines) {
      await recordPriceObservation(sb, {
        tenantId: input.tenantId,
        supplierId: input.supplierId,
        inventoryItemId: l.inventoryItemId ?? null,
        priceType: "invoiced",
        price: l.unitPrice,
        quantity: l.quantity,
        currency: input.currency,
        effectiveDate: input.invoiceDate,
        sourceType: "supplier_invoice",
        sourceId: invoice.id,
        dedupeSuffix: l.description,
      });
    }
  }

  await recordProcurementAudit(sb, userId, {
    tenantId: input.tenantId,
    documentType: "supplier_invoice",
    documentId: invoice.id,
    documentNumber,
    action: "created",
    newState: "recorded",
    metadata: { supplier_invoice_number: input.supplierInvoiceNumber, total },
  });

  await emitRestaurantEvent(sb, userId, {
    type: "restaurant.purchase.invoice.recorded",
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    locationId: input.locationId,
    entityType: "restaurant_supplier_invoice",
    entityId: invoice.id,
    source: "restaurant-os",
    dedupeKey: `restaurant.invoice.${invoice.id}.recorded`,
    payload: { document_number: documentNumber, total, supplier_id: input.supplierId },
  });

  const match = await matchSupplierInvoice(sb, userId, input.tenantId, invoice.id);
  return { id: invoice.id, documentNumber, total, match };
}

/** Three-way match: order vs accepted receipts vs invoice. Reports, never approves. */
export async function matchSupplierInvoice(sb: Sb, userId: string, tenantId: string, invoiceId: string) {
  await assertCapability(sb, userId, tenantId, "invoice.manage");

  const { data: invoice, error } = await sb
    .from("restaurant_supplier_invoices")
    .select(
      "id, tenant_id, supplier_id, purchase_order_id, document_number, total, currency, property_id, location_id",
    )
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId)
    .single();
  if (error || !invoice) throw new Error("Supplier invoice not found.");

  const invoiceTotal = Number(invoice.total ?? 0);
  let orderTotal: number | null = null;
  let receivedValue: number | null = null;

  if (invoice.purchase_order_id) {
    const { data: po } = await sb
      .from("restaurant_purchase_orders")
      .select("id, total")
      .eq("tenant_id", tenantId)
      .eq("id", invoice.purchase_order_id)
      .single();
    orderTotal = po ? Number(po.total ?? 0) : null;

    const { data: receipts } = await sb
      .from("restaurant_goods_receipts")
      .select("id, accepted_value, status")
      .eq("tenant_id", tenantId)
      .eq("purchase_order_id", invoice.purchase_order_id)
      .eq("status", "posted");
    receivedValue = ((receipts ?? []) as any[]).reduce((s, r) => s + Number(r.accepted_value ?? 0), 0);
  }

  const tolerance = 0.01; // 1% commercial tolerance
  const within = (a: number | null, b: number) =>
    a == null ? null : Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * tolerance + 0.5;

  const orderOk = within(orderTotal, invoiceTotal);
  const receiptOk = within(receivedValue, invoiceTotal);

  let matchStatus: "unmatched" | "matched" | "partially_matched" | "mismatched";
  if (orderTotal == null && receivedValue == null) matchStatus = "unmatched";
  else if (orderOk !== false && receiptOk !== false) matchStatus = "matched";
  else if (orderOk === true || receiptOk === true) matchStatus = "partially_matched";
  else matchStatus = "mismatched";

  if (receivedValue != null && receiptOk === false) {
    await raiseVariance(sb, userId, {
      tenantId,
      propertyId: invoice.property_id,
      locationId: invoice.location_id,
      varianceType: "invoice",
      severity: "high",
      label: `Invoice ${invoice.document_number} does not match accepted goods value`,
      purchaseOrderId: invoice.purchase_order_id,
      invoiceId: invoice.id,
      supplierId: invoice.supplier_id,
      expectedValue: receivedValue,
      actualValue: invoiceTotal,
      currency: invoice.currency,
      detail: { stage: "three_way_match", order_total: orderTotal },
      dedupeKey: `invoice-match:${invoice.id}`,
    });
  }

  await sb
    .from("restaurant_supplier_invoices")
    .update({
      match_status: matchStatus,
      matched_at: new Date().toISOString(),
      status: matchStatus === "mismatched" ? "disputed" : matchStatus === "matched" ? "matched" : "recorded",
    })
    .eq("tenant_id", tenantId)
    .eq("id", invoice.id);

  await recordProcurementAudit(sb, userId, {
    tenantId,
    documentType: "supplier_invoice",
    documentId: invoice.id,
    documentNumber: invoice.document_number,
    action: "matched",
    newState: matchStatus,
    metadata: { order_total: orderTotal, received_value: receivedValue, invoice_total: invoiceTotal },
  });

  await emitRestaurantEvent(sb, userId, {
    type: "restaurant.purchase.invoice.matched",
    tenantId,
    propertyId: invoice.property_id ?? undefined,
    locationId: invoice.location_id ?? undefined,
    entityType: "restaurant_supplier_invoice",
    entityId: invoice.id,
    source: "restaurant-os",
    dedupeKey: `restaurant.invoice.${invoice.id}.${matchStatus}`,
    payload: {
      match_status: matchStatus,
      order_total: orderTotal,
      received_value: receivedValue,
      invoice_total: invoiceTotal,
    },
  });

  return { matchStatus, orderTotal, receivedValue, invoiceTotal };
}

export async function setInvoicePaymentStatus(
  sb: Sb,
  userId: string,
  input: z.infer<typeof setInvoicePaymentStatusSchema>,
) {
  await assertCapability(sb, userId, input.tenantId, "invoice.manage");
  const { data: before } = await sb
    .from("restaurant_supplier_invoices")
    .select("id, payment_status, document_number, total, match_status")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.invoiceId)
    .single();
  if (!before) throw new Error("Supplier invoice not found.");
  if (input.paymentStatus === "paid" && before.match_status === "mismatched" && !input.reason) {
    throw new Error("A mismatched invoice needs a written reason before it can be marked paid.");
  }

  const { data, error } = await sb
    .from("restaurant_supplier_invoices")
    .update({
      payment_status: input.paymentStatus,
      amount_paid:
        input.amountPaid ?? (input.paymentStatus === "paid" ? Number(before.total ?? 0) : undefined),
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.invoiceId)
    .select("id, payment_status, amount_paid")
    .single();
  if (error) throw new Error(error.message);

  await recordProcurementAudit(sb, userId, {
    tenantId: input.tenantId,
    documentType: "supplier_invoice",
    documentId: input.invoiceId,
    documentNumber: before.document_number,
    action: "payment_status_changed",
    previousState: before.payment_status,
    newState: input.paymentStatus,
    reason: input.reason ?? null,
    metadata: { amount_paid: data.amount_paid },
  });
  return data;
}
