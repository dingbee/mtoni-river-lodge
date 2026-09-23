import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasStayNasEntitlement, normalizeStayNasRoles, type StayNasModuleId } from "@/lib/staynas-entitlements";
import { useEffect, useState } from "react";

// Superset of DB app_role. Kept in sync with public.app_role.
export type Role =
  | "owner"
  | "manager"
  | "reception"
  | "marketing"
  | "housekeeping"
  | "finance"
  | "editor";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  reception: "Reception",
  marketing: "Marketing",
  housekeeping: "Housekeeping",
  finance: "Finance",
  editor: "Editor",
};

// Capability map: which roles may access each module id.
// `null` = everyone with any staff role may see it.
export const MODULE_ROLES: Record<string, Role[] | null> = {
  dashboard: null,
  "operations.reservations": ["owner", "manager", "reception"],
  "operations.calendar": ["owner", "manager", "reception"],
  "operations.rooms": ["owner", "manager", "reception", "housekeeping"],
  "operations.housekeeping": ["owner", "manager", "reception", "housekeeping"],
  "hospitality.online-checkin.arrivals": ["owner", "manager", "reception"],
  "guests.crm": ["owner", "manager", "reception", "marketing"],
  "guests.reviews": ["owner", "manager", "marketing"],
  "guests.messages": ["owner", "manager", "reception"],
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
  "settings.migrations.respad": ["owner", "manager"],
  "ai.command": ["owner", "manager", "reception", "marketing", "finance", "housekeeping", "editor"],
  "ai.insights": ["owner", "manager"],
  "ai.knowledge": ["owner", "manager", "marketing", "editor"],
  "ai.activity": ["owner", "manager"],
  "ai.settings": ["owner"],
};

export function useCurrentUserRoles() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return useQuery({
    queryKey: ["current-user-roles", userId],
    enabled: authReady && Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_roles");
      if (error) throw new Error(error.message);
      return normalizeStayNasRoles((data ?? []) as string[]);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type ModuleAccessState = "allowed" | "denied" | "checking" | "error";

export function getModuleAccessState(
  moduleId: string | undefined,
  roles: readonly string[],
  options: { isLoading: boolean; isError: boolean },
): ModuleAccessState {
  if (!moduleId) return "allowed";
  if (options.isLoading) return "checking";
  if (options.isError) return "error";
  return canAccessModule(moduleId, roles) ? "allowed" : "denied";
}


const STAYNAS_MODULE_ALIASES: Record<string, StayNasModuleId> = {
  overview: "overview",
  reservations: "reservations",
  rooms: "rooms",
  "rooms.configure": "rooms.configure",
  "front-desk": "front-desk",
  operations: "operations",
  housekeeping: "housekeeping",
  guests: "guests",
  finance: "finance",
  revenue: "revenue",
  automation: "automation",
  knowledge: "knowledge",
  "ai.concierge": "ai.concierge",
  "ai.guests": "ai.guests",
  "ai.operations": "ai.operations",
  "ai.revenue": "ai.revenue",
  "ai.executive": "ai.executive",
  system: "system",
  "system.health": "system",
  "system.information": "system",
  "system.users": "system",
  "system.roles": "system",
  "system.entitlements": "system",
  "system.activity": "system",
  "system.settings": "system",
};

export function canAccessModule(moduleId: string, roles: readonly string[]): boolean {
  const stayNasModule = STAYNAS_MODULE_ALIASES[moduleId];
  if (stayNasModule) return hasStayNasEntitlement(stayNasModule, roles);

  const allowed = MODULE_ROLES[moduleId];
  if (allowed === null || allowed === undefined) return true;

  const normalizedRoles = normalizeStayNasRoles(roles);
  return normalizedRoles.some((role) => allowed.includes(role));
}
