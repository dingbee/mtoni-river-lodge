import type { Role } from "@/lib/permissions";

export type StayNasModuleId =
  | "overview"
  | "reservations"
  | "rooms"
  | "front-desk"
  | "operations"
  | "housekeeping"
  | "guests"
  | "finance"
  | "revenue"
  | "automation"
  | "ai.concierge"
  | "ai.guests"
  | "ai.operations"
  | "ai.revenue"
  | "ai.executive"
  | "knowledge"
  | "system";

export type ModuleEntitlement = {
  id: StayNasModuleId;
  label: string;
  description: string;
  roles: Role[];
};

export const STAYNAS_MODULE_ENTITLEMENTS: ModuleEntitlement[] = [
  { id: "overview", label: "Overview", description: "Executive command centre and operational summary.", roles: ["owner", "manager", "reception", "housekeeping", "finance", "marketing", "editor"] },
  { id: "reservations", label: "Reservations", description: "Reservations, availability and booking lifecycle.", roles: ["owner", "manager", "reception"] },
  { id: "rooms", label: "Rooms", description: "Room inventory, status and allocation.", roles: ["owner", "manager", "reception", "housekeeping"] },
  { id: "front-desk", label: "Front Desk", description: "Arrival, departure and guest-facing operations.", roles: ["owner", "manager", "reception"] },
  { id: "operations", label: "Operations", description: "Daily operational board, tasks and alerts.", roles: ["owner", "manager", "reception", "housekeeping"] },
  { id: "housekeeping", label: "Housekeeping", description: "Room cleaning, inspections and housekeeping workflow.", roles: ["owner", "manager", "housekeeping"] },
  { id: "guests", label: "Guests", description: "Guest profiles, communications and relationship context.", roles: ["owner", "manager", "reception", "marketing"] },
  { id: "finance", label: "Finance", description: "Payments, invoices and financial controls.", roles: ["owner", "manager", "finance"] },
  { id: "revenue", label: "Revenue", description: "Revenue performance and commercial intelligence.", roles: ["owner", "manager", "finance"] },
  { id: "automation", label: "Automation", description: "Operational automations and workflow controls.", roles: ["owner", "manager"] },
  { id: "ai.concierge", label: "Concierge", description: "Guest-facing AI concierge capabilities.", roles: ["owner", "manager", "reception"] },
  { id: "ai.guests", label: "Guest Intelligence", description: "Guest intelligence, signals and recommendations.", roles: ["owner", "manager", "reception", "marketing"] },
  { id: "ai.operations", label: "Operations Intelligence", description: "Operational signals, recommendations and decision support.", roles: ["owner", "manager", "reception", "housekeeping"] },
  { id: "ai.revenue", label: "Revenue Intelligence", description: "Revenue signals, forecasts and recommendations.", roles: ["owner", "manager", "finance"] },
  { id: "ai.executive", label: "Executive Intelligence", description: "Cross-property executive intelligence and decision support.", roles: ["owner", "manager"] },
  { id: "knowledge", label: "Knowledge", description: "Property knowledge and operational reference material.", roles: ["owner", "manager", "reception", "housekeeping", "finance", "marketing", "editor"] },
  { id: "system", label: "System", description: "Users, roles, system controls and configuration.", roles: ["owner", "manager"] },
];

export const ROLE_ENTITLEMENTS: Record<Role, readonly StayNasModuleId[]> = Object.fromEntries(
  STAYNAS_MODULE_ENTITLEMENTS.map((module) => module.id).map(() => [])
) as Record<Role, readonly StayNasModuleId[]>;

for (const module of STAYNAS_MODULE_ENTITLEMENTS) {
  for (const role of module.roles) {
    (ROLE_ENTITLEMENTS[role] as StayNasModuleId[]).push(module.id);
  }
}

export function hasStayNasEntitlement(
  moduleId: StayNasModuleId,
  roles: readonly string[],
): boolean {
  return roles.some((role) =>
    ROLE_ENTITLEMENTS[role as Role]?.includes(moduleId),
  );
}
