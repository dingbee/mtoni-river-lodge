import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Command, PanelLeftClose, X } from "lucide-react";
import { NAV, type NavItem } from "./nav-config";
import { canAccessModule } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { usePropertyContext } from "@/modules/property/PropertyContext";
import { supabase } from "@/integrations/supabase/client";

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
        "group relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active
          ? "bg-primary/[0.09] font-semibold text-[color:var(--os-ink)] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary"
          : "text-[color:var(--os-ink-2)] hover:bg-muted/70 hover:text-[color:var(--os-ink)]",
        collapsed && "justify-center px-2",
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon
        className={cn(
          "h-[16px] w-[16px] shrink-0 transition-colors",
          active
            ? "text-primary"
            : "text-[color:var(--os-ink-3)] group-hover:text-[color:var(--os-ink)]",
        )}
        aria-hidden
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
    </Link>
  );
}

export function AdminSidebar({
  collapsed,
  roles,
  onNavigate,
  onCollapse,
  mobile = false,
}: {
  collapsed: boolean;
  roles: readonly string[];
  onNavigate?: () => void;
  onCollapse?: () => void;
  mobile?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { organisation, property } = usePropertyContext();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [groupsRestored, setGroupsRestored] = useState(false);
  const [founderAdmin, setFounderAdmin] = useState(false);

  // Navigation visibility is only a convenience. The route and every server
  // operation independently re-authorize the founder using the database.
  useEffect(() => {
    let active = true;
    const verifyFounder = async (userId: string) => {
      const rpc = supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown | null }>;
      const { data, error } = await rpc("commercial_is_founder_admin", {
        _principal_id: userId,
      });
      if (active) setFounderAdmin(!error && data === true);
    };
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void verifyFounder(data.user.id);
      else if (active) setFounderAdmin(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void Promise.resolve().then(() => verifyFounder(session.user.id));
      } else if (active) setFounderAdmin(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  // Keep expanded navigation groups across route changes and browser reloads.
  // Hydrate after mount to avoid server/client markup mismatches.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("staynas.sidebar.open-groups.v1");
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setOpenGroups(parsed as Record<string, boolean>);
        }
      }
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    } finally {
      setGroupsRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!groupsRestored) return;
    try {
      window.localStorage.setItem("staynas.sidebar.open-groups.v1", JSON.stringify(openGroups));
    } catch {
      // Persistence is best-effort; it must never block navigation.
    }
  }, [groupsRestored, openGroups]);

  const entries = useMemo(
    () =>
      NAV.map((entry) => {
        if (entry.kind === "item") {
          const allowed = entry.item.id === "commercial"
            ? founderAdmin
            : canAccessModule(entry.item.id, roles);
          return allowed ? entry : null;
        }
        const items = entry.group.items.filter((i) => i.id === "commercial"
          ? founderAdmin
          : canAccessModule(i.id, roles));
        return items.length ? { ...entry, group: { ...entry.group, items } } : null;
      }).filter(Boolean) as typeof NAV,
    [roles, founderAdmin],
  );

  const toggle = (id: string) => setOpenGroups((s) => ({ ...s, [id]: !s[id] }));

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--os-surface)]",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label="Primary navigation"
    >
      <div
        className={cn(
          "flex h-[68px] shrink-0 items-center border-b border-[color:var(--os-hairline)] px-4",
          collapsed ? "justify-center" : "gap-3",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-sm">
          S
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] font-semibold leading-none tracking-tight text-[color:var(--os-ink)]">
              StayNas
            </p>
            <p className="mt-1.5 truncate text-[0.58rem] font-medium uppercase tracking-[0.2em] text-[color:var(--os-ink-3)]">
              Command Centre
            </p>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">
        <ul className="space-y-1">
          {entries.map((entry) => {
            if (entry.kind === "item") {
              const active = isActive(pathname, entry.item.href);
              return (
                <li key={entry.item.id}>
                  <NavLink
                    item={entry.item}
                    collapsed={collapsed}
                    active={active}
                    onNavigate={onNavigate}
                  />
                </li>
              );
            }
            const group = entry.group;
            const anyActive = group.items.some((i) => isActive(pathname, i.href));
            const isOpen = openGroups[group.id] ?? anyActive;
            const GroupIcon = group.icon;
            return (
              <li key={group.id} className="pt-2">
                {collapsed ? (
                  <div className="mb-1 flex justify-center py-1.5">
                    {GroupIcon && (
                      <GroupIcon className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-8 w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--os-ink-3)] transition-colors hover:bg-muted/50 hover:text-[color:var(--os-ink)]"
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")}
                      aria-hidden
                    />
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
        <div className="shrink-0 border-t border-[color:var(--os-hairline)] bg-[color:var(--os-surface)] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Command className="h-3.5 w-3.5 text-[color:var(--os-ink-3)]" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--os-ink-3)]">
              Workspace
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[color:var(--os-hairline)] bg-[color:var(--os-canvas)] p-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold leading-4 text-[color:var(--os-ink)]">
                {property?.name ?? organisation?.name ?? "StayNas workspace"}
              </p>
              <p className="mt-1 truncate text-[10px] leading-3.5 text-[color:var(--os-ink-3)]">
                {organisation?.name ?? "Workspace"} · Owner
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--os-ink-3)]" aria-hidden />
          </div>
        </div>
      )}
      <div className="shrink-0 border-t border-[color:var(--os-hairline)] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={mobile ? onNavigate : onCollapse}
          aria-label={mobile ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={mobile ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-[color:var(--os-ink-2)] transition-colors hover:bg-muted/70 hover:text-[color:var(--os-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            collapsed && "justify-center px-2",
          )}
        >
          {mobile ? <X className="h-4 w-4 shrink-0" aria-hidden /> : <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden />}
          {!collapsed && <span>{mobile ? "Close menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>}
        </button>
      </div>
    </aside>
  );
}
