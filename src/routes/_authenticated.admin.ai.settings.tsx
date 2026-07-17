import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { getMyAiScope } from "@/domains/ai/ai.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/settings")({
  head: () => ({ meta: [{ title: "AI Settings — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiSettings,
});

function AiSettings() {
  const scopeFn = useServerFn(getMyAiScope);
  const scope = useQuery({ queryKey: ["ai.scope"], queryFn: () => scopeFn() });

  return (
    <div className="space-y-4">
      <PageHeader title="Mtoni AI Settings" description="Configuration and scope for the AI Command Centre." />
      <SectionCard title="Model">
        <div className="text-sm">Chat model: <Badge variant="secondary">google/gemini-2.5-flash</Badge></div>
        <div className="mt-2 text-xs text-muted-foreground">
          Managed via the Lovable AI Gateway. All requests are audited to <code>ai_activity_logs</code>.
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