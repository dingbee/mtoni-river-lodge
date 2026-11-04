import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/os/PageHeader";
import { RespadMigrationWorkspace } from "@/components/os/migration/RespadMigrationWorkspace";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isFounderAiAdmin } from "@/domains/ai/governance.functions";
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
  const accessFn = useServerFn(isFounderAiAdmin);
  const access = useQuery({ queryKey: ["staynas-founder-admin"], queryFn: () => accessFn() });
  if (access.isLoading) return <div className="p-6 text-sm text-muted-foreground">Verifying founder access…</div>;
  if (access.isError || access.data !== true) {
    return <ComingSoon title="Founder administration only" description="ResPad migration staging is a platform-wide operation and is restricted to the StayNas founder administrator." />;
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