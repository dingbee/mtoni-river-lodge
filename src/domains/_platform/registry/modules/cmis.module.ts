import { FileText, Palette, CalendarDays, Star } from "lucide-react";
import { defineModule } from "../registry";

/** Sprint 5 · CMIS Phase 1 — new module registrations.
 *  Existing content.* / marketing.* modules stay in their own files; this
 *  file only adds the new surfaces introduced by CMIS. */

const contentRoles = ["owner","manager","marketing","editor","admin"] as const;
const marketingRoles = ["owner","manager","marketing","admin"] as const;

export const contentPagesModule = defineModule({
  id: "content.pages",
  name: "Pages",
  description: "Website pages, blocks and version history",
  icon: FileText,
  route: "/admin/content/pages",
  parentId: "content",
  order: 5,
  requiredRoles: [...contentRoles],
  featureFlag: "cms_pages",
  status: "beta",
});

export const contentBrandModule = defineModule({
  id: "content.brand",
  name: "Brand Centre",
  description: "Logos, palette, fonts, tone of voice",
  icon: Palette,
  route: "/admin/content/brand",
  parentId: "content",
  order: 70,
  requiredRoles: [...contentRoles],
  featureFlag: "brand_centre",
  status: "beta",
});

export const contentCalendarModule = defineModule({
  id: "content.calendar",
  name: "Content Calendar",
  description: "Unified publishing calendar",
  icon: CalendarDays,
  route: "/admin/content/calendar",
  parentId: "content",
  order: 80,
  requiredRoles: [...contentRoles],
  featureFlag: "content_calendar",
  status: "beta",
});

export const marketingReviewsModule = defineModule({
  id: "marketing.reviews",
  name: "Reputation",
  description: "Reviews & reputation centre",
  icon: Star,
  route: "/admin/marketing/reviews",
  parentId: "marketing",
  order: 40,
  requiredRoles: [...marketingRoles],
  featureFlag: "reviews_centre_v2",
  status: "beta",
});