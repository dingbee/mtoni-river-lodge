/**
 * Adapter: derive the existing NavEntry[] shape from the registry so the
 * current AdminSidebar keeps working. This is the Sprint 2+ bridge; a
 * future sprint can replace the sidebar to consume ResolvedModule[] directly.
 */
import type { NavEntry } from "@/components/os/nav-config";
import { MODULE_REGISTRY } from "./registry";
import type { ModuleDefinition } from "./types";

const GROUP_LABELS: Record<string, string> = {
  operations: "Operations",
  guests: "Guests",
  content: "Content",
  marketing: "Marketing",
  finance: "Finance",
  staff: "Staff",
};

function byOrder(a: ModuleDefinition, b: ModuleDefinition) {
  return (a.order ?? 999) - (b.order ?? 999);
}

/** Build NavEntry[] from registry, respecting status (hides "hidden"/"disabled"). */
export function buildNavFromRegistry(): NavEntry[] {
  const visible = MODULE_REGISTRY.filter((m) => m.status === "active" || m.status === "beta");
  const groups = new Map<string, ModuleDefinition[]>();
  const singles: ModuleDefinition[] = [];
  for (const m of visible) {
    if (m.parentId) {
      const arr = groups.get(m.parentId) ?? [];
      arr.push(m); groups.set(m.parentId, arr);
    } else {
      singles.push(m);
    }
  }
  const entries: NavEntry[] = [];
  const seenGroups = new Set<string>();
  for (const m of [...singles, ...visible].sort(byOrder)) {
    if (m.parentId) {
      if (seenGroups.has(m.parentId)) continue;
      seenGroups.add(m.parentId);
      const items = (groups.get(m.parentId) ?? []).sort(byOrder).map((c) => ({
        id: c.id, label: c.name, href: c.route, icon: c.icon,
      }));
      const firstIcon = items[0]?.icon;
      entries.push({
        kind: "group",
        group: {
          id: m.parentId,
          label: GROUP_LABELS[m.parentId] ?? m.parentId,
          icon: firstIcon,
          items,
        },
      });
    } else {
      entries.push({ kind: "item", item: { id: m.id, label: m.name, href: m.route, icon: m.icon } });
    }
  }
  return entries;
}
