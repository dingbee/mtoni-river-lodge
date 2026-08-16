import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/os/PageHeader";
import { RespadMigrationWorkspace } from "@/components/os/migration/RespadMigrationWorkspace";
import { useCurrentUserRoles, canAccessModule } from "@/lib/permissions";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/settings/migrations/respad")({
  head: () => ({
    meta: [
      { title: "ResPad migration staging — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RespadMigrationPage,
});

function RespadMigrationPage() {
  const { data: roles = [], isLoading } = useCurrentUserRoles();
  if (!isLoading && !canAccessModule("settings.migrations.respad", roles)) {
    return (
      <ComingSoon
        title="Restricted"
        description="Migration tools are available to owners and managers only."
      />
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="ResPad migration"
        description="Staging, audit and mapping layer for the ResPad → Mtoni OS data migration. Read-only with respect to production data."
      />
      <RespadMigrationWorkspace />
    </div>
  );
}