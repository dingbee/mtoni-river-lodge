import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { listAiActivity } from "@/domains/ai/ai.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/activity")({
  head: () => ({ meta: [{ title: "AI Activity — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AiActivity,
});

function AiActivity() {
  const listFn = useServerFn(listAiActivity);
  const { data, isLoading } = useQuery({ queryKey: ["ai.activity"], queryFn: () => listFn() });

  return (
    <div className="space-y-4">
      <PageHeader title="AI Activity" description="Immutable log of every Mtoni AI request. Scoped by role — you see your own activity; managers see all." />
      <SectionCard>
        {isLoading ? (
          <LoadingState />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={History} title="No AI activity yet" description="Once questions are asked in the Command Centre, they will appear here." />
        ) : (
          <div className="divide-y">
            {data.map((row: any) => (
              <div key={row.id} className="grid gap-1 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{row.question}</div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>
                {row.response && <div className="text-muted-foreground line-clamp-2">{row.response}</div>}
                <div className="flex flex-wrap gap-1 pt-1 text-xs">
                  {row.tool_called && <Badge variant="outline">tool: {row.tool_called}</Badge>}
                  {(row.domains_accessed ?? []).map((d: string) => <Badge key={d} variant="secondary">{d}</Badge>)}
                  {row.model && <Badge variant="outline">{row.model}</Badge>}
                  {typeof row.duration_ms === "number" && <Badge variant="outline">{row.duration_ms} ms</Badge>}
                  <Badge variant={row.status === "completed" ? "outline" : "destructive"}>{row.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}