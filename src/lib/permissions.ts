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
  "operations.reservations": ["owner", "manager", "reception", "reservations"],
  "operations.calendar": ["owner", "manager", "reception", "reservations"],
  "operations.rooms": ["owner", "manager", "reception", "housekeeping"],
  "operations.housekeeping": ["owner", "manager", "reception", "housekeeping", "reservations"],
  "guests.crm": ["owner", "manager", "reception", "marketing", "reservations"],
  "guests.reviews": ["owner", "manager", "marketing"],
  "guests.messages": ["owner", "manager", "reception", "reservations"],
  "content.homepage": ["owner", "manager", "marketing", "editor"],
  "content.rooms": ["owner", "manager", "marketing", "editor"],
  "content.experiences": ["owner", "manager", "marketing", "editor"],
  "content.journal": ["owner", "manager", "marketing", "editor"],
  "content.gallery": ["owner", "manager", "marketing", "editor"],
  "content.media": ["owner", "manager", "marketing", "editor"],
  "content.pages": ["owner", "manager", "marketing", "editor"],
  "content.brand": ["owner", "manager", "marketing", "editor"],
  "content.calendar": ["owner", "manager", "marketing", "editor"],
  "marketing.seo": ["owner", "manager", "marketing"],
  "marketing.campaigns": ["owner", "manager", "marketing"],
  "marketing.analytics": ["owner", "manager", "marketing"],
  "marketing.reviews": ["owner", "manager", "marketing"],
  "finance.payments": ["owner", "manager", "finance"],
  "finance.invoices": ["owner", "manager", "finance"],
  "finance.reports": ["owner", "manager", "finance"],
  "staff.users": ["owner", "manager"],
  "staff.roles": ["owner"],
  "staff.activity": ["owner", "manager"],
  automation: ["owner", "manager"],
  settings: ["owner", "manager"],
  "ai.command": ["owner", "manager", "reception", "marketing", "finance", "housekeeping", "editor", "reservations"],
  "ai.insights": ["owner", "manager"],
  "ai.knowledge": ["owner", "manager", "marketing", "editor"],
  "ai.activity": ["owner", "manager"],
  "ai.settings": ["owner"],
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