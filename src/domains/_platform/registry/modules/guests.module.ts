import { Users, Star, MessageSquare } from "lucide-react";
import { defineModule } from "../registry";

export const guestsCrmModule = defineModule({
  id: "guests.crm",
  name: "Guest CRM",
  description: "Guest directory, profiles, notes, tags",
  icon: Users,
  route: "/admin/guests/crm",
  parentId: "guests",
  order: 10,
  requiredRoles: ["owner","manager","reception","marketing","reservations"],
  featureFlag: "guest_crm",
  status: "active",
});

export const guestsReviewsModule = defineModule({
  id: "guests.reviews",
  name: "Reviews",
  description: "Guest reviews and testimonials",
  icon: Star,
  route: "/admin/reviews",
  parentId: "guests",
  order: 20,
  requiredRoles: ["owner","manager","marketing"],
  status: "active",
});

export const guestsMessagesModule = defineModule({
  id: "guests.messages",
  name: "Messages",
  description: "Direct guest communication",
  icon: MessageSquare,
  route: "/admin/guests/messages",
  parentId: "guests",
  order: 30,
  requiredRoles: ["owner","manager","reception","reservations"],
  status: "beta",
});
