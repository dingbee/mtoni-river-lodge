import { CreditCard, FileText, PieChart, LayoutDashboard, BarChart3, ClipboardCheck, Activity, AlertTriangle } from "lucide-react";
import { defineModule } from "../registry";

const roles = ["owner","manager","finance"] as const;

export const financeDashboardModule = defineModule({
  id: "finance.dashboard", name: "Revenue Dashboard", description: "Live financial KPIs",
  icon: LayoutDashboard, route: "/admin/finance", parentId: "finance", order: 5,
  requiredRoles: [...roles], status: "active",
});
export const financePaymentsModule = defineModule({
  id: "finance.payments", name: "Payments", description: "Payments and settlements",
  icon: CreditCard, route: "/admin/finance/payments", parentId: "finance", order: 10,
  requiredRoles: [...roles], status: "active",
});
export const financeInvoicesModule = defineModule({
  id: "finance.invoices", name: "Invoices", description: "Guest invoices",
  icon: FileText, route: "/admin/finance/invoices", parentId: "finance", order: 20,
  requiredRoles: [...roles], status: "active",
});
export const financeAnalyticsModule = defineModule({
  id: "finance.analytics", name: "Revenue Analytics", description: "Deep revenue reporting",
  icon: BarChart3, route: "/admin/finance/analytics", parentId: "finance", order: 30,
  requiredRoles: [...roles], status: "active",
});
export const financeReconciliationModule = defineModule({
  id: "finance.reconciliation", name: "Reconciliation", description: "Match payments to bookings",
  icon: ClipboardCheck, route: "/admin/finance/reconciliation", parentId: "finance", order: 40,
  requiredRoles: [...roles], status: "active",
});
export const financePricingModule = defineModule({
  id: "finance.pricing", name: "Rate & Pricing", description: "Seasonal and promotional rate rules",
  icon: PieChart, route: "/admin/finance/pricing", parentId: "finance", order: 50,
  requiredRoles: [...roles], status: "active",
});
export const financeForecastModule = defineModule({
  id: "finance.forecast", name: "Forecast", description: "Revenue and occupancy forecast",
  icon: Activity, route: "/admin/finance/forecast", parentId: "finance", order: 60,
  requiredRoles: [...roles], status: "active",
});
export const financeAlertsModule = defineModule({
  id: "finance.alerts", name: "Alerts", description: "Financial alerts",
  icon: AlertTriangle, route: "/admin/finance/alerts", parentId: "finance", order: 70,
  requiredRoles: [...roles], status: "active",
});
export const financeReportsModule = defineModule({
  id: "finance.reports", name: "Reports", description: "Financial reporting",
  icon: PieChart, route: "/admin/finance/reports", parentId: "finance", order: 80,
  requiredRoles: [...roles], status: "active",
});
