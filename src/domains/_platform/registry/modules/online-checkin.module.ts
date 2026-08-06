import { UserCheck } from "lucide-react";
import { defineModule } from "../registry";

export const onlineCheckInArrivalsModule = defineModule({
  id: "hospitality.online-checkin.arrivals",
  name: "Arrivals",
  description: "Online check-in progress for today's arrivals",
  icon: UserCheck,
  route: "/admin/operations/arrivals",
  parentId: "operations",
  order: 35,
  requiredRoles: ["owner", "manager", "reception"],
  featureFlag: "online_checkin",
  status: "beta",
});
