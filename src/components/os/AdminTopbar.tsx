import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, LogOut, Menu, PanelLeft, PanelRight, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPanel } from "./NotificationsPanel";
import { findNavByHref } from "./nav-config";
import { useUnreadCount } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function AdminTopbar({
  onToggleSidebar,
  onOpenMobileNav,
  commandOpen,
  onCommandOpenChange,
  onToggleRail,
  railOpen,
}: {
  onToggleSidebar: () => void;
  onOpenMobileNav: () => void;
  commandOpen: boolean;
  onCommandOpenChange: (open: boolean) => void;
  onToggleRail?: () => void;
  railOpen?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hit = findNavByHref(pathname);
  const title = hit.item?.label ?? "Dashboard";
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = useUnreadCount();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[color:var(--os-hairline)] bg-[color:var(--os-canvas)]/85 px-3 backdrop-blur-xl supports-[backdrop-filter]:bg-[color:var(--os-canvas)]/70 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          className="hidden lg:inline-flex"
          onClick={onToggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation menu"
          className="lg:hidden"
          onClick={onOpenMobileNav}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
          <div className="min-w-0">
            <p className="truncate font-display text-sm text-foreground">{title}</p>
            <Breadcrumbs />
          </div>
        </div>
        <p className="flex-1 truncate font-display text-sm text-foreground lg:hidden">{title}</p>

        <button
          type="button"
          onClick={() => onCommandOpenChange(true)}
          className={cn(
            "hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground shadow-sm transition-colors hover:text-foreground md:flex",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          <span>Search…</span>
          <kbd className="ml-2 rounded border border-border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-widest">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          className="md:hidden"
          onClick={() => onCommandOpenChange(true)}
        >
          <Search className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative"
          onClick={() => setNotifOpen(true)}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-destructive" />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/admin/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/">View website</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {onToggleRail && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={railOpen ? "Hide AI assistant" : "Show AI assistant"}
            className="hidden xl:inline-flex"
            onClick={onToggleRail}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        )}
      </header>

      <CommandPalette open={commandOpen} onOpenChange={onCommandOpenChange} />
      <NotificationsPanel open={notifOpen} onOpenChange={setNotifOpen} />
    </>
  );
}