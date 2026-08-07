/**
 * Restaurant & Bar OS — capability map.
 *
 * Roles are commercial hospitality roles stored in `restaurant_members`
 * (tenant-scoped). They are separate from Mtoni platform roles: a Mtoni
 * owner/admin/manager keeps oversight, but day-to-day restaurant permissions
 * are per-tenant so the module can be sold to other operators.
 *
 * This map mirrors the RLS policies in Postgres. It exists for UI affordances
 * only — the database remains the enforcement point.
 */
import type { RestaurantRole } from "./contracts";

export const RESTAURANT_ROLE_LABELS: Record<RestaurantRole, string> = {
  owner: "Owner",
  general_manager: "General Manager",
  restaurant_manager: "Restaurant Manager",
  chef: "Chef",
  kitchen_manager: "Kitchen Manager",
  bartender: "Bartender",
  inventory_manager: "Inventory Manager",
  purchasing_officer: "Purchasing Officer",
  accountant: "Accountant",
  viewer: "Viewer",
};

export const RESTAURANT_CAPABILITIES = [
  "tenant.manage",
  "location.manage",
  "menu.manage",
  "inventory.manage",
  "supplier.manage",
  "purchase.request",
  "purchasing.manage",
  "purchasing.approve",
  "receiving.manage",
  "invoice.manage",
  "variance.manage",
  "costing.manage",
  "sales.manage",
  "kitchen.manage",
  "stock.manage",
  "profitability.manage",
  "intelligence.read",
] as const;
export type RestaurantCapability = (typeof RESTAURANT_CAPABILITIES)[number];

const CAPABILITY_ROLES: Record<RestaurantCapability, readonly RestaurantRole[]> = {
  "tenant.manage": ["owner", "general_manager"],
  "location.manage": ["owner", "general_manager", "restaurant_manager"],
  "menu.manage": ["owner", "general_manager", "restaurant_manager", "chef", "kitchen_manager"],
  "inventory.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "inventory_manager",
    "kitchen_manager",
    "chef",
    "bartender",
  ],
  "supplier.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "purchasing_officer",
    "inventory_manager",
  ],
  "purchase.request": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "purchasing_officer",
    "inventory_manager",
    "kitchen_manager",
    "chef",
    "bartender",
  ],
  "purchasing.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "purchasing_officer",
    "inventory_manager",
    "accountant",
  ],
  "purchasing.approve": ["owner", "general_manager", "restaurant_manager"],
  "receiving.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "inventory_manager",
    "purchasing_officer",
    "kitchen_manager",
    "chef",
  ],
  "invoice.manage": ["owner", "general_manager", "restaurant_manager", "accountant", "purchasing_officer"],
  "variance.manage": ["owner", "general_manager", "restaurant_manager", "accountant", "purchasing_officer"],
  "costing.manage": ["owner", "general_manager", "restaurant_manager", "chef", "kitchen_manager", "accountant"],
  "sales.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "bartender",
    "chef",
    "kitchen_manager",
    "accountant",
  ],
  "kitchen.manage": ["owner", "general_manager", "restaurant_manager", "chef", "kitchen_manager", "bartender"],
  "stock.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "inventory_manager",
    "kitchen_manager",
    "chef",
    "bartender",
    "purchasing_officer",
  ],
  "profitability.manage": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "chef",
    "kitchen_manager",
    "accountant",
  ],
  "intelligence.read": [
    "owner",
    "general_manager",
    "restaurant_manager",
    "chef",
    "kitchen_manager",
    "inventory_manager",
    "purchasing_officer",
    "accountant",
  ],
};

export function rolesForCapability(capability: RestaurantCapability): readonly RestaurantRole[] {
  return CAPABILITY_ROLES[capability];
}

export function hasRestaurantCapability(
  roles: readonly string[],
  capability: RestaurantCapability,
  platformAdmin = false,
): boolean {
  if (platformAdmin) return true;
  return roles.some((r) => (CAPABILITY_ROLES[capability] as readonly string[]).includes(r));
}