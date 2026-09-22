import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { AdminAssistantRail } from "./AdminAssistantRail";
import { useCurrentUserRoles, canAccessModule } from "@/lib/permissions";
import { useRealtimeNotifications } from "@/lib/notifications";
import { installIntelligenceBridge } from "@/modules/intelligence/activation/bridge";
import { applyOsTheme, useOsTheme } from "@/lib/os-theme";
import { PropertyProvider } from "@/modules/property/PropertyContext";
import { findNavByHref } from "./nav-config";
import { LockKeyhole } from "lucide-react";

const COLLAPSED_KEY = "staynas-os.sidebar.collapsed";
const RAIL_KEY = "staynas-os.rail.open";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const { data: roles = [], isLoading: rolesLoading } = useCurrentUserRoles();
  const { pathname } = useLocation();
  const { resolved } = useOsTheme();
  const nav = findNavByHref(pathname);
  const requiredModule = nav.item?.id;
  const hasModuleAccess =
    !requiredModule || rolesLoading || canAccessModule(requiredModule, roles);

  useRealtimeNotifications();

  useEffect(() => {
    applyOsTheme(resolved);
    return () => applyOsTheme(null);
  }, [resolved]);

  useEffect(() => installIntelligenceBridge(), []);

  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSED_KEY);
      if (v === "1") setCollapsed(true);
      const r = localStorage.getItem(RAIL_KEY);
      if (r === "0") setRailOpen(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
      localStorage.setItem(RAIL_KEY, railOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, railOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PropertyProvider>
      <div className="staynas-os flex min-h-screen text-foreground">
        <div className="hidden lg:block">
          <AdminSidebar collapsed={collapsed} roles={roles} />
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <AdminSidebar collapsed={false} roles={roles} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar
            onToggleSidebar={() => setCollapsed((v) => !v)}
            onOpenMobileNav={() => setMobileOpen(true)}
            commandOpen={commandOpen}
            onCommandOpenChange={setCommandOpen}
            onToggleRail={() => setRailOpen((v) => !v)}
            railOpen={railOpen}
          />
          <div className="flex min-w-0 flex-1">
            <main
              id="admin-main"
              className="min-w-0 flex-1 px-4 py-6 pb-[env(safe-area-inset-bottom)] lg:px-8 lg:py-8"
            >
              {hasModuleAccess ? children : <ModuleAccessDenied />}
            </main>
            {railOpen && (
              <aside
                aria-label="Assistant"
                className="hidden xl:block w-[340px] shrink-0 border-l border-[color:var(--os-hairline)] bg-[color:var(--os-surface)] backdrop-blur-sm"
              >
                <AdminAssistantRail />
              </aside>
            )}
          </div>
        </div>
      </div>
    </PropertyProvider>
  );
}

function ModuleAccessDenied() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-2xl border border-[color:var(--os-hairline)] bg-[color:var(--os-surface)] p-8 text-center shadow-sm">
        <LockKeyhole className="mx-auto mb-4 size-6 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Module access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your current StayNas role does not have access to this module.
        </p>
      </div>
    </div>
  );
}
