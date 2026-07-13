import { Award, Concierge as ConciergeIcon, Wrench, Package, Building2 } from "lucide-react";
import { defineModule } from "../registry";

// Fully implemented registration; feature flags keep them hidden until enabled.
export const loyaltyModule = defineModule({
  id: "guests.loyalty", name: "Loyalty", description: "Loyalty tiers & rewards",
  icon: Award, route: "/admin/guests/loyalty", parentId: "guests", order: 40,
  requiredRoles: ["owner","manager","marketing","admin"],
  featureFlag: "loyalty", status: "hidden",
});
export const conciergeModule = defineModule({
  id: "guests.concierge", name: "Concierge", description: "Itineraries and requests",
  icon: ConciergeIcon, route: "/admin/guests/concierge", parentId: "guests", order: 50,
  requiredRoles: ["owner","manager","reception","admin"],
  featureFlag: "concierge", status: "hidden",
});
export const maintenanceModule = defineModule({
  id: "operations.maintenance", name: "Maintenance", description: "Maintenance tickets",
  icon: Wrench, route: "/admin/operations/maintenance", parentId: "operations", order: 50,
  requiredRoles: ["owner","manager","housekeeping","admin"],
  featureFlag: "maintenance", status: "hidden",
});
export const procurementModule = defineModule({
  id: "operations.procurement", name: "Procurement", description: "Suppliers and stock",
  icon: Package, route: "/admin/operations/procurement", parentId: "operations", order: 60,
  requiredRoles: ["owner","manager","finance","admin"],
  featureFlag: "procurement", status: "hidden",
});
export const multiPropertyModule = defineModule({
  id: "system.properties", name: "Properties", description: "Multi-property tenancy",
  icon: Building2, route: "/admin/properties", order: 210,
  requiredRoles: ["owner","admin"],
  featureFlag: "multi_property", status: "hidden",
});
