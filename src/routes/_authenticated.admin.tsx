import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/os/AdminShell";
import { AdminErrorBoundary } from "@/components/os/AdminErrorBoundary";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminLayout,
  errorComponent: ({ error, reset }) => (
    <AdminShell>
      <AdminErrorBoundary error={error} reset={reset} />
    </AdminShell>
  ),
  notFoundComponent: () => (
    <AdminShell>
      <ComingSoon title="Not found" description="This admin screen does not exist." />
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