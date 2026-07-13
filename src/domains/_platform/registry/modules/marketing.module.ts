import { Search, Sparkles, BarChart3 } from "lucide-react";
import { defineModule } from "../registry";

const roles = ["owner","manager","marketing","admin"] as const;

export const marketingSeoModule = defineModule({
  id: "marketing.seo", name: "SEO", description: "SEO scans and metadata",
  icon: Search, route: "/admin/marketing/seo", parentId: "marketing", order: 10,
  requiredRoles: [...roles], status: "active",
});
export const marketingCampaignsModule = defineModule({
  id: "marketing.campaigns", name: "Campaigns", description: "Marketing campaigns",
  icon: Sparkles, route: "/admin/marketing/campaigns", parentId: "marketing", order: 20,
  requiredRoles: [...roles], featureFlag: "marketing_automation", status: "beta",
});
export const marketingAnalyticsModule = defineModule({
  id: "marketing.analytics", name: "Analytics", description: "Marketing analytics",
  icon: BarChart3, route: "/admin/marketing/analytics", parentId: "marketing", order: 30,
  requiredRoles: [...roles], status: "active",
});
