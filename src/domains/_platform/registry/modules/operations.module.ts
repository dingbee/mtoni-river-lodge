import { LayoutDashboard, Bed, CalendarDays, ClipboardCheck, ListChecks, AlertTriangle, Activity } from "lucide-react";
import { defineModule } from "../registry";

export const opsDashboardModule = defineModule({
  id: "operations.dashboard",
  name: "Operations Centre",
  description: "Live dashboard for reception & operations",
  icon: LayoutDashboard,
  route: "/admin/operations",
  parentId: "operations",
  order: 5,
  requiredRoles: ["owner","manager","reception"],
  featureFlag: "operations_centre",
  status: "active",
});

export const opsRoomBoardModule = defineModule({
  id: "operations.rooms.board",
  name: "Room Board",
  description: "Real-time room status",
  icon: Bed,
  route: "/admin/operations/rooms",
  parentId: "operations",
  order: 32,
  requiredRoles: ["owner","manager","reception","housekeeping"],
  featureFlag: "operations_centre",
  status: "active",
});

export const opsCalendarModule = defineModule({
  id: "operations.calendar.grid",
  name: "Room Calendar",
  description: "Day/week/month reservation grid",
  icon: CalendarDays,
  route: "/admin/calendar",
  parentId: "operations",
  order: 22,
  requiredRoles: ["owner","manager","reception"],
  featureFlag: "operations_centre",
  status: "active",
});

export const opsHousekeepingModule = defineModule({
  id: "operations.housekeeping",
  name: "Housekeeping",
  description: "Cleaning, inspection, maintenance",
  icon: ClipboardCheck,
  route: "/admin/operations/housekeeping",
  parentId: "operations",
  order: 40,
  requiredRoles: ["owner","manager","reception","housekeeping"],
  featureFlag: "operations_centre",
  status: "active",
});

export const opsTasksModule = defineModule({
  id: "operations.tasks",
  name: "Tasks",
  description: "Operational tasks & assignments",
  icon: ListChecks,
  route: "/admin/operations/tasks",
  parentId: "operations",
  order: 45,
  requiredRoles: ["owner","manager","reception","housekeeping"],
  featureFlag: "operations_centre",
  status: "active",
});

export const opsAlertsModule = defineModule({
  id: "operations.alerts",
  name: "Alerts",
  description: "Late arrivals, overdue departures, conflicts",
  icon: AlertTriangle,
  route: "/admin/operations/alerts",
  parentId: "operations",
  order: 50,
  requiredRoles: ["owner","manager","reception"],
  featureFlag: "operations_centre",
  status: "active",
});

export const opsTimelineModule = defineModule({
  id: "operations.timeline",
  name: "Live Timeline",
  description: "Real-time feed of operational events",
  icon: Activity,
  route: "/admin/operations/timeline",
  parentId: "operations",
  order: 55,
  requiredRoles: ["owner","manager","reception"],
  featureFlag: "operations_centre",
  status: "active",
});