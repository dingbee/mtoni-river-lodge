import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { AdminAssistantRail } from "./AdminAssistantRail";
import { useCurrentUserRoles } from "@/lib/permissions";

const COLLAPSED_KEY = "mtoni-os.sidebar.collapsed";
const RAIL_KEY = "mtoni-os.rail.open";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const { data: roles = [] } = useCurrentUserRoles();

  // Read persisted collapse state on mount (browser storage — avoid hydration mismatch)
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

  // ⌘K / Ctrl+K opens command palette
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
    <div className="mtoni-os flex min-h-screen text-foreground">
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
            {children}
          </main>
          {railOpen && (
            <aside className="hidden xl:block w-[340px] shrink-0 border-l border-[color:var(--os-hairline)] bg-[color:var(--os-surface-2)]/60 backdrop-blur-sm">
              <AdminAssistantRail />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}