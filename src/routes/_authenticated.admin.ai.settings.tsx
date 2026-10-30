import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { getMyAiScope } from "@/domains/ai/ai.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/settings")({
  head: () => ({ meta: [{ title: "AI Settings — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiSettings,
});

function AiSettings() {
  const scopeFn = useServerFn(getMyAiScope);
  const scope = useQuery({ queryKey: ["ai.scope"], queryFn: () => scopeFn() });

  if (scope.isPending) return <div className="p-6 text-sm text-muted-foreground">Verifying access…</div>;
  if (scope.isError || !scope.data) return <div className="p-6 text-sm text-muted-foreground">This workspace is restricted to Nolmark CDMA founder administration.</div>;

  return (
    <div className="space-y-4">
      <PageHeader title="StayNas AI Settings" description="Founder-governed configuration and scope for StayNas Intelligence." />
      <SectionCard title="Provider governance">
        <div className="text-sm"><Badge variant="secondary">Founder managed</Badge></div>
        <div className="mt-2 text-xs text-muted-foreground">
          Provider endpoints, model selection and credentials are controlled by Nolmark CDMA. Secrets remain server-side and are never exposed to property tenants.
        </div>
      </SectionCard>
      <SectionCard title="Your role scope">
        <div className="flex flex-wrap gap-1 text-sm">
          {(scope.data?.roles ?? []).map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {scope.data?.tools?.length ?? 0} tools available. AI answers are constrained to domains permitted by your role.
        </div>
      </SectionCard>
      <SectionCard title="Feature flag">
        <div className="text-sm">
          <code>mtoni_ai_command_centre</code> · <Badge variant="outline">internal</Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Command Centre is currently gated to owner/admin roles via the platform feature-flag layer.
        </p>
      </SectionCard>
    </div>
  );
}