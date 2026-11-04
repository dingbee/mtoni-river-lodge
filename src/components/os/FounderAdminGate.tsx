import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { isFounderAiAdmin } from "@/domains/ai/governance.functions";

export function FounderAdminGate({
  children,
  description = "This workspace uses platform-wide records that are not yet tenant-scoped.",
}: {
  children: ReactNode;
  description?: string;
}) {
  const accessFn = useServerFn(isFounderAiAdmin);
  const access = useQuery({
    queryKey: ["staynas-founder-admin"],
    queryFn: () => accessFn(),
  });

  if (access.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Verifying founder access…</div>;
  }

  if (access.isError || access.data !== true) {
    return (
      <div className="rounded-xl border p-6">
        <h1 className="text-lg font-semibold">Founder administration only</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    );
  }

  return <>{children}</>;
}
