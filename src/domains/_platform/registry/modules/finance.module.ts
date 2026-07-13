import { CreditCard, FileText, PieChart } from "lucide-react";
import { defineModule } from "../registry";

const roles = ["owner","manager","finance","admin"] as const;

export const financePaymentsModule = defineModule({
  id: "finance.payments", name: "Payments", description: "Payments and settlements",
  icon: CreditCard, route: "/admin/finance/payments", parentId: "finance", order: 10,
  requiredRoles: [...roles], status: "active",
});
export const financeInvoicesModule = defineModule({
  id: "finance.invoices", name: "Invoices", description: "Guest invoices",
  icon: FileText, route: "/admin/finance/invoices", parentId: "finance", order: 20,
  requiredRoles: [...roles], featureFlag: "finance", status: "beta",
});
export const financeReportsModule = defineModule({
  id: "finance.reports", name: "Reports", description: "Financial reporting",
  icon: PieChart, route: "/admin/finance/reports", parentId: "finance", order: 30,
  requiredRoles: [...roles], featureFlag: "finance", status: "beta",
});
