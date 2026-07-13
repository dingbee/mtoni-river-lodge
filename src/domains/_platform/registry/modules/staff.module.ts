import { UserCog, ShieldCheck, History } from "lucide-react";
import { defineModule } from "../registry";

export const staffUsersModule = defineModule({
  id: "staff.users", name: "Users", description: "Staff user accounts",
  icon: UserCog, route: "/admin/staff/users", parentId: "staff", order: 10,
  requiredRoles: ["owner","manager","admin"], status: "active",
});
export const staffRolesModule = defineModule({
  id: "staff.roles", name: "Roles", description: "Role assignments",
  icon: ShieldCheck, route: "/admin/staff/roles", parentId: "staff", order: 20,
  requiredRoles: ["owner","admin"], status: "active",
});
export const staffActivityModule = defineModule({
  id: "staff.activity", name: "Activity Log", description: "Audit log of admin actions",
  icon: History, route: "/admin/staff/activity", parentId: "staff", order: 30,
  requiredRoles: ["owner","manager","admin"], status: "active",
});
