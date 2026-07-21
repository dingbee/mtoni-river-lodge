import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NAV, type NavItem } from "./nav-config";
import { canAccessModule } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/mtoni-river-lodge-logo.png.asset.json";
const logo = logoAsset.url;

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-nav-active={active ? "true" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "font-medium"
          : "text-[color:var(--os-ink-2)] hover:bg-white/[0.03] hover:text-[color:var(--os-ink)]",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn("h-[15px] w-[15px] shrink-0 transition-colors", active ? "text-[color:var(--os-green)]" : "text-[color:var(--os-ink-3)] group-hover:text-[color:var(--os-ink)]")} aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function AdminSidebar({
  collapsed,
  roles,
  onNavigate,
}: {
  collapsed: boolean;
  roles: readonly string[];
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const entries = useMemo(
    () =>
      NAV.map((entry) => {
        if (entry.kind === "item") {
          return canAccessModule(entry.item.id, roles) ? entry : null;
        }
        const items = entry.group.items.filter((i) => canAccessModule(i.id, roles));
        return items.length ? { ...entry, group: { ...entry.group, items } } : null;
      }).filter(Boolean) as typeof NAV,
    [roles],
  );

  const toggle = (id: string) => setOpenGroups((s) => ({ ...s, [id]: !s[id] }));

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-[color:var(--os-hairline)] bg-[color:var(--os-surface)]",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label="Primary navigation"
    >
      <div className={cn("flex h-14 items-center border-b border-[color:var(--os-hairline)] px-3", collapsed ? "justify-center" : "gap-2.5")}>
        <img src={logo} alt="" className="h-8 w-8 shrink-0 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] leading-none tracking-tight text-[color:var(--os-ink)]">Mtoni OS</p>
            <p className="mt-1 truncate text-[0.58rem] uppercase tracking-[0.24em] text-[color:var(--os-ink-3)]">Command Centre</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {entries.map((entry) => {
            if (entry.kind === "item") {
              const active = isActive(pathname, entry.item.href);
              return (
                <li key={entry.item.id}>
                  <NavLink item={entry.item} collapsed={collapsed} active={active} onNavigate={onNavigate} />
                </li>
              );
            }
            const group = entry.group;
            const anyActive = group.items.some((i) => isActive(pathname, i.href));
            const isOpen = openGroups[group.id] ?? anyActive;
            const GroupIcon = group.icon;
            return (
              <li key={group.id} className="mt-3">
                {collapsed ? (
                  <div className="mb-1 flex justify-center">
                    {GroupIcon && <GroupIcon className="h-4 w-4 text-muted-foreground/60" aria-hidden />}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-muted-foreground/80 hover:text-foreground"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                )}
                {(collapsed || isOpen) && (
                  <ul className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <NavLink
                          item={item}
                          collapsed={collapsed}
                          active={isActive(pathname, item.href)}
                          onNavigate={onNavigate}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {!collapsed && (
        <div className="border-t border-border p-3 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
          Mtoni River Lodge
        </div>
      )}
    </aside>
  );
}