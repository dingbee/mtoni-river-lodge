/**
 * Restaurant & Bar OS — shared contracts.
 * Browser-safe: types + zod schemas only.
 */
import { z } from "zod";

export const RESTAURANT_ROLES = [
  "owner",
  "general_manager",
  "restaurant_manager",
  "chef",
  "kitchen_manager",
  "bartender",
  "inventory_manager",
  "purchasing_officer",
  "accountant",
  "viewer",
] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];

export const RESTAURANT_LOCATION_TYPES = [
  "restaurant",
  "bar",
  "kitchen",
  "banquet",
  "room_service",
  "cafe",
  "store",
] as const;
export type RestaurantLocationType = (typeof RESTAURANT_LOCATION_TYPES)[number];

export const MENU_STATUSES = ["draft", "published", "archived"] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];

export const PO_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PO_STATUSES)[number];

export const INVENTORY_ITEM_TYPES = ["ingredient", "beverage", "consumable", "packaging"] as const;
export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

const uuid = z.string().uuid();

/** Every read/write is scoped by this envelope. Property/location narrow it. */
export const tenantScopeSchema = z.object({
  tenantId: uuid,
  propertyId: uuid.optional(),
  locationId: uuid.optional(),
});
export type TenantScope = z.infer<typeof tenantScopeSchema>;

/* ---------------- Tenancy ---------------- */

export interface RestaurantTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  settings: RestaurantTenantSettings;
}

/** Configurable per tenant — never hard-coded in the app. */
export interface RestaurantTenantSettings {
  tax?: { vat_percent?: number; inclusive?: boolean; label?: string };
  service_charge_percent?: number;
  default_currency?: string;
}

export interface RestaurantProperty {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  status: string;
}

export interface RestaurantLocation {
  id: string;
  tenant_id: string;
  property_id: string;
  slug: string;
  name: string;
  location_type: string;
  status: string;
}

export interface RestaurantSubscription {
  plan: string;
  status: string;
  seats: number;
  features: Record<string, boolean>;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export interface RestaurantWorkspace {
  tenant: RestaurantTenant | null;
  tenants: Array<Pick<RestaurantTenant, "id" | "slug" | "name">>;
  properties: RestaurantProperty[];
  locations: RestaurantLocation[];
  subscription: RestaurantSubscription | null;
  /** Restaurant roles the caller holds in the active tenant. */
  roles: RestaurantRole[];
  /** True when the caller is a Mtoni platform owner/admin/manager. */
  platformAdmin: boolean;
}

export const workspaceSchema = z.object({ tenantId: uuid.optional() });

/* ---------------- Menu ---------------- */

export const listMenusSchema = tenantScopeSchema.extend({
  status: z.enum(MENU_STATUSES).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const upsertMenuSchema = tenantScopeSchema.extend({
  id: uuid.optional(),
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  version: z.number().int().min(1).default(1),
  status: z.enum(MENU_STATUSES).default("draft"),
  currency: z.string().min(3).max(3).default("TZS"),
  description: z.string().max(2000).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});
export type UpsertMenuInput = z.infer<typeof upsertMenuSchema>;

export const listMenuItemsSchema = z.object({
  tenantId: uuid,
  menuId: uuid.optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const upsertMenuItemSchema = z.object({
  tenantId: uuid,
  id: uuid.optional(),
  menuId: uuid,
  categoryId: uuid.optional(),
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  price: z.number().min(0).default(0),
  currency: z.string().min(3).max(3).default("TZS"),
  available: z.boolean().default(true),
  tags: z.array(z.string().max(40)).default([]),
  allergens: z.array(z.string().max(40)).default([]),
  sortOrder: z.number().int().min(0).default(0),
});
export type UpsertMenuItemInput = z.infer<typeof upsertMenuItemSchema>;

export const listCategoriesSchema = z.object({
  tenantId: uuid,
  kind: z.string().max(40).default("menu"),
});

/* ---------------- Inventory ---------------- */

export const listInventorySchema = tenantScopeSchema.extend({
  itemType: z.enum(INVENTORY_ITEM_TYPES).optional(),
  lowOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(500).default(200),
});

export const upsertInventoryItemSchema = tenantScopeSchema.extend({
  id: uuid.optional(),
  categoryId: uuid.optional(),
  unitId: uuid.optional(),
  sku: z.string().max(60).optional(),
  name: z.string().min(2).max(160),
  itemType: z.enum(INVENTORY_ITEM_TYPES).default("ingredient"),
  currentQuantity: z.number().default(0),
  parLevel: z.number().optional(),
  reorderPoint: z.number().optional(),
  averageCost: z.number().min(0).default(0),
  currency: z.string().min(3).max(3).default("TZS"),
});
export type UpsertInventoryItemInput = z.infer<typeof upsertInventoryItemSchema>;

/* ---------------- Suppliers ---------------- */

export const listSuppliersSchema = z.object({
  tenantId: uuid,
  limit: z.number().int().min(1).max(300).default(100),
});

export const upsertSupplierSchema = z.object({
  tenantId: uuid,
  id: uuid.optional(),
  name: z.string().min(2).max(160),
  code: z.string().max(40).optional(),
  contactName: z.string().max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(400).optional(),
  paymentTerms: z.string().max(120).optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  status: z.string().max(30).default("active"),
});
export type UpsertSupplierInput = z.infer<typeof upsertSupplierSchema>;

/* ---------------- Purchasing ---------------- */

export const listPurchaseOrdersSchema = tenantScopeSchema.extend({
  status: z.enum(PO_STATUSES).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const createPurchaseOrderSchema = tenantScopeSchema.extend({
  supplierId: uuid.optional(),
  reference: z.string().max(60).optional(),
  expectedAt: z.string().optional(),
  currency: z.string().min(3).max(3).default("TZS"),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        inventoryItemId: uuid.optional(),
        supplierProductId: uuid.optional(),
        unitId: uuid.optional(),
        description: z.string().min(1).max(200),
        quantity: z.number().min(0),
        unitPrice: z.number().min(0),
      }),
    )
    .default([]),
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const transitionPurchaseOrderSchema = z.object({
  tenantId: uuid,
  id: uuid,
  status: z.enum(PO_STATUSES),
});

/* ---------------- Costing ---------------- */

export const recipeSchema = z.object({ tenantId: uuid, menuItemId: uuid });

export const upsertRecipeComponentSchema = z.object({
  tenantId: uuid,
  id: uuid.optional(),
  menuItemId: uuid,
  inventoryItemId: uuid.optional(),
  unitId: uuid.optional(),
  quantity: z.number().min(0),
  yieldPercent: z.number().min(1).max(100).default(100),
  notes: z.string().max(500).optional(),
});

export const computeRecipeCostSchema = z.object({
  tenantId: uuid,
  menuItemId: uuid,
  targetMargin: z.number().min(0).max(95).optional(),
  overheadCost: z.number().min(0).default(0),
});
export type ComputeRecipeCostInput = z.infer<typeof computeRecipeCostSchema>;