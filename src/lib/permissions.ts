import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUserRoles } from "@/lib/user-roles.functions";

// Superset of DB app_role. Kept in sync with public.app_role.
export type Role =
  | "owner"
  | "manager"
  | "reception"
  | "marketing"
  | "housekeeping"
  | "finance"
  | "editor"
  | "admin" // legacy — treated as owner
  | "reservations"; // legacy — treated as reception

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  reception: "Reception",
  marketing: "Marketing",
  housekeeping: "Housekeeping",
  finance: "Finance",
  editor: "Editor",
  admin: "Owner (legacy)",
  reservations: "Reception (legacy)",
};

// Capability map: which roles may access each module id.
// `null` = everyone with any staff role may see it.
export const MODULE_ROLES: Record<string, Role[] | null> = {
  dashboard: null,
  "operations.reservations": ["owner", "manager", "reception", "admin", "reservations"],
  "operations.calendar": ["owner", "manager", "reception", "admin", "reservations"],
  "operations.rooms": ["owner", "manager", "reception", "housekeeping", "admin"],
  "operations.housekeeping": ["owner", "manager", "reception", "housekeeping", "admin", "reservations"],
  "guests.crm": ["owner", "manager", "reception", "marketing", "admin", "reservations"],
  "guests.reviews": ["owner", "manager", "marketing", "admin"],
  "guests.messages": ["owner", "manager", "reception", "admin", "reservations"],
  "content.homepage": ["owner", "manager", "marketing", "editor", "admin"],
  "content.rooms": ["owner", "manager", "marketing", "editor", "admin"],
  "content.experiences": ["owner", "manager", "marketing", "editor", "admin"],
  "content.journal": ["owner", "manager", "marketing", "editor", "admin"],
  "content.gallery": ["owner", "manager", "marketing", "editor", "admin"],
  "content.media": ["owner", "manager", "marketing", "editor", "admin"],
  "marketing.seo": ["owner", "manager", "marketing", "admin"],
  "marketing.campaigns": ["owner", "manager", "marketing", "admin"],
  "marketing.analytics": ["owner", "manager", "marketing", "admin"],
  "finance.payments": ["owner", "manager", "finance", "admin"],
  "finance.invoices": ["owner", "manager", "finance", "admin"],
  "finance.reports": ["owner", "manager", "finance", "admin"],
  "staff.users": ["owner", "manager", "admin"],
  "staff.roles": ["owner", "admin"],
  "staff.activity": ["owner", "manager", "admin"],
  automation: ["owner", "manager", "admin"],
  settings: ["owner", "manager", "admin"],
};

export function useCurrentUserRoles() {
  const fn = useServerFn(getCurrentUserRoles);
  return useQuery({
    queryKey: ["current-user-roles"],
    queryFn: () => fn({}),
    staleTime: 5 * 60 * 1000,
  });
}

export function canAccessModule(moduleId: string, roles: readonly string[]): boolean {
  const allowed = MODULE_ROLES[moduleId];
  if (allowed === null || allowed === undefined) return true;
  return roles.some((r) => (allowed as string[]).includes(r));
}