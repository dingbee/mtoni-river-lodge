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

  return (
    <div className="space-y-4">
      <PageHeader title="StayNas AI Settings" description="Platform AI configuration and your authorised operating scope." />
      <SectionCard title="Model">
        <div className="text-sm">Default chat model: <Badge variant="secondary">google/gemini-2.5-flash</Badge></div>
        <div className="mt-2 text-xs text-muted-foreground">
          Model requests are managed through the configured AI gateway. Requests are audited in the platform AI activity log.
        </div>
      </SectionCard>
      <SectionCard title="Your role scope">
        <div className="flex flex-wrap gap-1 text-sm">
          {(scope.data?.roles ?? []).map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {scope.data?.tools?.length ?? 0} tools available. AI answers are constrained to domains permitted by your active property role.
        </div>
      </SectionCard>
    </div>
  );
}