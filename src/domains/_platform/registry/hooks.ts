import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useCurrentUserRoles, canAccessModule } from "@/lib/permissions";
import { MODULE_REGISTRY, resolveModules, findModuleByRoute, findModuleById } from "./registry";
import type { ResolvedModule } from "./types";

export function useVisibleModules(): ResolvedModule[] {
  const { data: roles } = useCurrentUserRoles();
  return useMemo(
    () => resolveModules(MODULE_REGISTRY, { roles: roles ?? [] }, canAccessModule).filter((m) => m.visible),
    [roles],
  );
}

export function useModule(id: string) {
  return useMemo(() => findModuleById(id), [id]);
}

/** Breadcrumb trail for the current pathname, derived from the registry. */
export function useModuleBreadcrumbs(): { label: string; href: string }[] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useMemo(() => {
    if (!pathname.startsWith("/admin")) return [];
    const parts = pathname.replace(/\/$/, "").split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];
    let acc = "";
    for (const part of parts) {
      acc += "/" + part;
      const hit = findModuleByRoute(acc);
      crumbs.push({
        label: hit?.name ?? part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        href: acc,
      });
    }
    return crumbs;
  }, [pathname]);
}
