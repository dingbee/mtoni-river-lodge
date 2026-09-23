import type { Role } from "@/lib/permissions";

export type StayNasModuleId =
  | "overview"
  | "reservations"
  | "rooms"
  | "rooms.configure"
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
  { id: "rooms.configure", label: "Room Configuration", description: "Room types, inventory quantities, pricing and guest-facing room content.", roles: ["owner", "manager"] },
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

export const ROLE_ENTITLEMENTS: Record<Role, StayNasModuleId[]> = {
  owner: [],
  manager: [],
  reception: [],
  housekeeping: [],
  finance: [],
  marketing: [],
  editor: [],
};

for (const module of STAYNAS_MODULE_ENTITLEMENTS) {
  for (const role of module.roles) {
    (ROLE_ENTITLEMENTS[role] as StayNasModuleId[]).push(module.id);
  }
}

// Legacy auth compatibility: the original StayNas database enum used
// `admin` before the reusable StayNas role model introduced `owner`.
// Existing authenticated accounts must continue to resolve to the equivalent
// owner-level module access until their role is explicitly migrated.
const LEGACY_ROLE_ALIASES: Record<string, Role> = {
  admin: "owner",
};

export function normalizeStayNasRoles(roles: readonly string[]): Role[] {
  return Array.from(
    new Set(
      roles
        .map((role) => LEGACY_ROLE_ALIASES[role] ?? role)
        .filter((role): role is Role => role in ROLE_ENTITLEMENTS),
    ),
  );
}

export function hasStayNasEntitlement(
  moduleId: StayNasModuleId,
  roles: readonly string[],
): boolean {
  return normalizeStayNasRoles(roles).some((role) =>
    ROLE_ENTITLEMENTS[role]?.includes(moduleId),
  );
}
