/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
import { z } from "zod";
import { listSuppliersSchema, type UpsertSupplierInput } from "../core/contracts";
import { assertCapability, assertTenantRead } from "../core/access.server";
import { emitRestaurantEvent } from "../events/emit.server";

type Sb = any;

export async function listSuppliers(sb: Sb, userId: string, input: z.infer<typeof listSuppliersSchema>) {
  await assertTenantRead(sb, userId, input.tenantId);
  const { data, error } = await sb
    .from("restaurant_suppliers")
    .select("id, code, name, contact_name, email, phone, payment_terms, lead_time_days, reliability_score, status")
    .eq("tenant_id", input.tenantId)
    .order("name")
    .limit(input.limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSupplierProducts(sb: Sb, userId: string, tenantId: string, supplierId?: string) {
  await assertTenantRead(sb, userId, tenantId);
  let q = sb
    .from("restaurant_supplier_products")
    .select("id, supplier_id, inventory_item_id, unit_id, supplier_sku, name, pack_size, unit_price, currency, lead_time_days, active")
    .eq("tenant_id", tenantId)
    .order("name");
  if (supplierId) q = q.eq("supplier_id", supplierId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertSupplier(sb: Sb, userId: string, input: UpsertSupplierInput) {
  await assertCapability(sb, userId, input.tenantId, "supplier.manage");
  const row = {
    tenant_id: input.tenantId,
    name: input.name,
    code: input.code ?? null,
    contact_name: input.contactName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    payment_terms: input.paymentTerms ?? null,
    lead_time_days: input.leadTimeDays ?? null,
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  const q = input.id
    ? sb.from("restaurant_suppliers").update(row).eq("id", input.id).eq("tenant_id", input.tenantId)
    : sb.from("restaurant_suppliers").insert(row);
  const { data, error } = await q.select("id").single();
  if (error) throw new Error(error.message);

  await emitRestaurantEvent(sb, userId, {
    type: "restaurant.supplier.updated",
    tenantId: input.tenantId,
    entityType: "restaurant_supplier",
    entityId: data.id,
    source: "restaurant-os",
    payload: { name: input.name, status: input.status },
  });
  return data;
}