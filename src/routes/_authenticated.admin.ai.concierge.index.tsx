import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import {
  listConciergeSessions,
  getConciergeSession,
  getConciergeStats,
} from "@/domains/ai/concierge/concierge.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/")({
  head: () => ({
    meta: [{ title: "AI Concierge — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: ConciergePage,
});

function ConciergePage() {
  const listFn = useServerFn(listConciergeSessions);
  const detailFn = useServerFn(getConciergeSession);
  const statsFn = useServerFn(getConciergeStats);
  const [selected, setSelected] = useState<string | null>(null);

  const stats = useQuery({ queryKey: ["concierge.stats"], queryFn: () => statsFn() });
  const sessions = useQuery({ queryKey: ["concierge.sessions"], queryFn: () => listFn() });
  const detail = useQuery({
    queryKey: ["concierge.session", selected],
    queryFn: () => detailFn({ data: { session_id: selected! } }),
    enabled: !!selected,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Concierge"
        description="Guest-facing website assistant. Review conversations, escalations, and topics."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Sessions (30d)" value={stats.data?.sessions_30d ?? "—"} />
        <StatCard label="Messages (30d)" value={stats.data?.messages_30d ?? "—"} />
        <StatCard label="Escalations (30d)" value={stats.data?.escalations_30d ?? "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <SectionCard title="Recent conversations">
          <div className="max-h-[600px] overflow-y-auto divide-y">
            {sessions.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {sessions.data?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>
            )}
            {sessions.data?.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted ${selected === s.id ? "bg-muted" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {(s.page_context as any)?.page ?? s.session_token}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.message_count} msgs · {formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {s.escalated && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" /> Esc
                    </Badge>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Transcript">
          {!selected && <p className="text-sm text-muted-foreground">Select a conversation to view the transcript.</p>}
          {selected && detail.isLoading && <p className="text-sm text-muted-foreground">Loading transcript…</p>}
          {selected && detail.data && (
            <div className="space-y-3">
              {detail.data.messages.map((m: any) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted"
                  }`}
                >
                  {m.content}
                  {m.role === "assistant" && (
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] opacity-70">
                      {typeof m.confidence === "number" && <span>Conf {Math.round(m.confidence * 100)}%</span>}
                      {m.escalated && <span className="text-destructive">escalated</span>}
                      {m.latency_ms != null && <span>{m.latency_ms}ms</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}