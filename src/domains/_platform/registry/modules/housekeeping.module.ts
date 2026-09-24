import { ClipboardCheck } from "lucide-react";
import { defineModule } from "../registry";

export const housekeepingModule = defineModule({
  id: "operations.housekeeping",
  name: "Housekeeping",
  description: "Room turnover, cleaning schedules",
  icon: ClipboardCheck,
  route: "/admin/operations/housekeeping",
  parentId: "operations",
  order: 40,
  requiredRoles: ["owner","manager","reception","housekeeping"],
  featureFlag: "housekeeping",
  status: "active",
});
