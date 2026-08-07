/**
 * Restaurant & Bar OS — public surface (browser-safe).
 * Server implementations stay behind *.server.ts.
 */
export * from "./core/contracts";
export * from "./core/permissions";
export * from "./events/contracts";
export { registerRestaurantIntelligence } from "./intelligence/provider";

export { getRestaurantWorkspaceFn } from "./core/tenancy.functions";
export { emitRestaurantEventFn } from "./events/events.functions";
export {
  listRestaurantMenusFn,
  upsertRestaurantMenuFn,
  listRestaurantMenuItemsFn,
  upsertRestaurantMenuItemFn,
  listRestaurantCategoriesFn,
} from "./menu/menu.functions";
export {
  listRestaurantInventoryFn,
  listRestaurantUnitsFn,
  upsertRestaurantInventoryItemFn,
} from "./inventory/inventory.functions";
export {
  listRestaurantSuppliersFn,
  listRestaurantSupplierProductsFn,
  upsertRestaurantSupplierFn,
} from "./suppliers/suppliers.functions";
export {
  listRestaurantPurchaseOrdersFn,
  createRestaurantPurchaseOrderFn,
  transitionRestaurantPurchaseOrderFn,
} from "./purchasing/purchasing.functions";
export {
  listRestaurantRecipeComponentsFn,
  upsertRestaurantRecipeComponentFn,
  computeRestaurantRecipeCostFn,
  listRestaurantRecipeCostsFn,
} from "./costing/costing.functions";
export {
  listRestaurantServicePeriodsFn,
  upsertRestaurantServicePeriodFn,
  listRestaurantTablesFn,
  upsertRestaurantTableFn,
  listRestaurantOrdersFn,
  getRestaurantOrderFn,
  createRestaurantOrderFn,
  addRestaurantOrderItemsFn,
  recordRestaurantPaymentFn,
  transitionRestaurantOrderFn,
} from "./sales/sales.functions";
export {
  listRestaurantStationsFn,
  upsertRestaurantStationFn,
  listRestaurantKitchenTicketsFn,
  fireRestaurantOrderFn,
  advanceRestaurantTicketFn,
  restaurantStationPerformanceFn,
} from "./kitchen/kitchen.functions";
export {
  listRestaurantStockMovementsFn,
  recordRestaurantStockMovementFn,
  transferRestaurantStockFn,
} from "./inventory/movements.functions";
export {
  computeRestaurantProfitabilityFn,
  listRestaurantProfitabilityFn,
} from "./costing/profitability.functions";
export { getRestaurantContextFn } from "./intelligence/context.functions";

/* Phase 3 — Restaurant Intelligence Activation */
export * from "./intelligence/types";
export * from "./intelligence/analysis";
export {
  getRestaurantMenuIntelligenceFn,
  getRestaurantInventoryIntelligenceFn,
  getRestaurantKitchenIntelligenceFn,
  getRestaurantPurchasingIntelligenceFn,
} from "./intelligence/insights.functions";

/* Phase 2 contracts (declared, not implemented) */
export * as SalesContracts from "./sales/contracts";
export * as ServiceOpsContracts from "./operations/contracts";