import { ClipboardCheck, UtensilsCrossed, BookOpen, Boxes, Truck, ShoppingCart, Calculator, Settings2, Receipt, ChefHat, ArrowLeftRight, PiggyBank } from "lucide-react";
import { defineModule } from "../registry";

const ROLES = ["owner", "manager", "finance"] as const;

export const restaurantOsModule = defineModule({
  id: "restaurant",
  name: "Restaurant & Bar OS",
  description: "Multi-tenant restaurant and bar operating system",
  icon: UtensilsCrossed,
  route: "/admin/restaurant",
  order: 55,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantMenuModule = defineModule({
  id: "restaurant.menu",
  name: "Menu Management",
  description: "Menus, versions, categories and items",
  icon: BookOpen,
  route: "/admin/restaurant/menu",
  parentId: "restaurant",
  order: 10,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantInventoryModule = defineModule({
  id: "restaurant.inventory",
  name: "Inventory",
  description: "Stock items, units and par levels",
  icon: Boxes,
  route: "/admin/restaurant/inventory",
  parentId: "restaurant",
  order: 20,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantSuppliersModule = defineModule({
  id: "restaurant.suppliers",
  name: "Suppliers",
  description: "Supplier directory and product catalogues",
  icon: Truck,
  route: "/admin/restaurant/suppliers",
  parentId: "restaurant",
  order: 30,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantPurchasingModule = defineModule({
  id: "restaurant.purchasing",
  name: "Purchasing",
  description: "Purchase orders and receiving",
  icon: ShoppingCart,
  route: "/admin/restaurant/purchasing",
  parentId: "restaurant",
  order: 40,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantCostingModule = defineModule({
  id: "restaurant.costing",
  name: "Recipe Costing",
  description: "Recipe components, food cost and margin",
  icon: Calculator,
  route: "/admin/restaurant/costing",
  parentId: "restaurant",
  order: 50,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantSettingsModule = defineModule({
  id: "restaurant.settings",
  name: "Tenant Settings",
  description: "Tenant, properties, outlets and plan",
  icon: Settings2,
  route: "/admin/restaurant/settings",
  parentId: "restaurant",
  order: 60,
  requiredRoles: ["owner", "manager"],
  featureFlag: "restaurant_os",
  status: "beta",
});
export const restaurantOrdersModule = defineModule({
  id: "restaurant.orders",
  name: "Orders",
  description: "Sales, tables, service periods and payment states",
  icon: Receipt,
  route: "/admin/restaurant/orders",
  parentId: "restaurant",
  order: 5,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantKitchenModule = defineModule({
  id: "restaurant.kitchen",
  name: "Kitchen",
  description: "Station tickets, preparation states and service delays",
  icon: ChefHat,
  route: "/admin/restaurant/kitchen",
  parentId: "restaurant",
  order: 8,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantStockModule = defineModule({
  id: "restaurant.stock",
  name: "Stock Movements",
  description: "Consumption, wastage, transfers and adjustments",
  icon: ArrowLeftRight,
  route: "/admin/restaurant/stock",
  parentId: "restaurant",
  order: 25,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantProfitabilityModule = defineModule({
  id: "restaurant.profitability",
  name: "Menu Profitability",
  description: "Actual food cost, gross profit and margin per menu item",
  icon: PiggyBank,
  route: "/admin/restaurant/profitability",
  parentId: "restaurant",
  order: 55,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});

export const restaurantProcurementModule = defineModule({
  id: "restaurant.procurement",
  name: "Procurement Centre",
  description: "Requests, approvals, receiving, variances and supplier invoices",
  icon: ClipboardCheck,
  route: "/admin/restaurant/procurement",
  parentId: "restaurant",
  order: 45,
  requiredRoles: [...ROLES],
  featureFlag: "restaurant_os",
  status: "beta",
});
