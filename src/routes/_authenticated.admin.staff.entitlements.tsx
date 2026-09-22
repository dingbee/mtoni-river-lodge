import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { useCurrentUserRoles } from "@/lib/permissions";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { STAYNAS_MODULE_ENTITLEMENTS } from "@/lib/staynas-entitlements";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/staff/entitlements")({
  head: () => ({ meta: [{ title: "Module Entitlements — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ModuleEntitlementsPage,
});

function ModuleEntitlementsPage() {
  const { data: roles, isLoading } = useCurrentUserRoles();
  const canManage = (roles ?? []).includes("owner");

  const roleColumns = useMemo<Role[]>(
    () => ["owner", "manager", "reception", "housekeeping", "finance", "marketing", "editor"],
    [],
  );

  if (isLoading) return <LoadingState />;

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Module entitlements" description="StayNas module access is controlled by role." />
        <SectionCard title="Restricted" description="Only an Owner can administer module entitlements.">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LockKeyhole className="size-4" />
            Your current role does not permit access administration.
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Module entitlements"
        description="The canonical StayNas access contract. This layer is application-defined and does not modify the database."
      />

      <SectionCard
        title="Role × module access"
        description="A check means the role is entitled to enter that module. Data-level security remains enforced separately by the backend."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--os-hairline)] text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3">Module</th>
                {roleColumns.map((role) => (
                  <th key={role} className="px-3 py-3 text-center">{ROLE_LABELS[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--os-hairline)]">
              {STAYNAS_MODULE_ENTITLEMENTS.map((module) => (
                <tr key={module.id}>
                  <td className="px-3 py-3">
                    <div className="font-medium">{module.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{module.description}</div>
                  </td>
                  {roleColumns.map((role) => {
                    const allowed = module.roles.includes(role);
                    return (
                      <td key={role} className="px-3 py-3 text-center">
                        {allowed ? (
                          <Check className="mx-auto size-4 text-[color:var(--os-success)]" aria-label={`${ROLE_LABELS[role]} can access`} />
                        ) : (
                          <span className="text-muted-foreground/30" aria-label={`${ROLE_LABELS[role]} cannot access`}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--os-hairline)] pt-4 text-xs text-muted-foreground">
          <Badge variant="outline">Application contract</Badge>
          <span>No schema migration, role assignment mutation, billing change, or production data change is performed by this screen.</span>
        </div>
      </SectionCard>
    </div>
  );
}
