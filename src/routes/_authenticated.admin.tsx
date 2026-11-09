import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/os/AdminShell";
import { AdminErrorBoundary } from "@/components/os/AdminErrorBoundary";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: ({ location }) => {
    // Retire the generic /admin landing page. Operational legacy subroutes
    // remain compatible while their namespace migration is completed.
    if (location.pathname === "/admin" || location.pathname === "/admin/") {
      throw redirect({ to: "/settings" });
    }
  },
  component: AdminLayout,
  errorComponent: ({ error, reset }) => (
    <AdminShell>
      <AdminErrorBoundary error={error} reset={reset} />
    </AdminShell>
  ),
  notFoundComponent: () => (
    <AdminShell>
      <ComingSoon title="Not found" description="This StayNas screen does not exist." />
    </AdminShell>
  ),
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
