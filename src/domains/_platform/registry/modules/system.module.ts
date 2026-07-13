import { LayoutDashboard, Settings } from "lucide-react";
import { defineModule } from "../registry";

export const dashboardModule = defineModule({
  id: "dashboard", name: "Dashboard", description: "Home overview",
  icon: LayoutDashboard, route: "/admin", order: 0, status: "active",
});

export const settingsModule = defineModule({
  id: "settings", name: "Settings", description: "Property settings",
  icon: Settings, route: "/admin/settings", order: 200,
  requiredRoles: ["owner","manager","admin"], status: "active",
});
