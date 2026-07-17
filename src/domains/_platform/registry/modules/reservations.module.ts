import { Calendar, CalendarDays, Bed } from "lucide-react";
import { defineModule } from "../registry";

export const reservationsModule = defineModule({
  id: "operations.reservations",
  name: "Reservations",
  description: "Bookings, guests, and stays",
  icon: Calendar,
  route: "/admin/bookings",
  parentId: "operations",
  order: 10,
  requiredRoles: ["owner","manager","reception","admin","reservations"],
  status: "active",
});

export const reservationsCalendarModule = defineModule({
  id: "operations.calendar",
  name: "Calendar",
  description: "Availability and arrivals calendar",
  icon: CalendarDays,
  route: "/admin/calendar",
  parentId: "operations",
  order: 20,
  requiredRoles: ["owner","manager","reception","admin","reservations"],
  status: "active",
});

export const reservationsRoomsModule = defineModule({
  id: "operations.rooms",
  name: "Rooms",
  description: "Room inventory and status",
  icon: Bed,
  route: "/admin/operations/rooms",
  parentId: "operations",
  order: 30,
  requiredRoles: ["owner","manager","reception","housekeeping","admin"],
  status: "active",
});
