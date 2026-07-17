import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listCopilotSessions, getCopilotSession, deleteCopilotSession, sendCopilotMessage,
  listPromptLibrary, submitCopilotFeedback, getCopilotAnalytics,
} from "@/domains/ai/copilot/copilot.functions";
import { Send, Trash2, Sparkles, MessageSquare, BookOpen, ThumbsUp, ThumbsDown, AlertTriangle, Copy, ChevronDown, ChevronUp, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai/copilot")({
  head: () => ({ meta: [{ title: "Staff Copilot — Mtoni AI" }] }),
  component: CopilotPage,
});

function CopilotPage() {
  const qc = useQueryClient();
  const listSessions = useServerFn(listCopilotSessions);
  const getSession = useServerFn(getCopilotSession);
  const send = useServerFn(sendCopilotMessage);
  const del = useServerFn(deleteCopilotSession);
  const listPrompts = useServerFn(listPromptLibrary);
  const feedback = useServerFn(submitCopilotFeedback);
  const analyticsFn = useServerFn(getCopilotAnalytics);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const sessionsQ = useQuery({ queryKey: ["copilot-sessions"], queryFn: () => listSessions({ data: undefined as any }) });
  const sessionQ = useQuery({
    queryKey: ["copilot-session", activeId],
    queryFn: () => getSession({ data: { sessionId: activeId! } }),
    enabled: !!activeId,
  });
  const promptsQ = useQuery({ queryKey: ["copilot-prompts"], queryFn: () => listPrompts({ data: undefined as any }) });
  const analyticsQ = useQuery({ queryKey: ["copilot-analytics"], queryFn: () => analyticsFn({ data: undefined as any }) });

  const sendM = useMutation({
    mutationFn: (payload: { sessionId: string | null; question: string }) => send({ data: payload }),
    onSuccess: (res: any) => {
      setActiveId(res.sessionId);
      qc.invalidateQueries({ queryKey: ["copilot-sessions"] });
      qc.invalidateQueries({ queryKey: ["copilot-session", res.sessionId] });
      qc.invalidateQueries({ queryKey: ["copilot-analytics"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to get response"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { sessionId: id } }),
    onSuccess: () => { setActiveId(null); qc.invalidateQueries({ queryKey: ["copilot-sessions"] }); },
  });
  const fbM = useMutation({
    mutationFn: (p: { messageId: string; rating: string }) => feedback({ data: p }),
    onSuccess: () => toast.success("Feedback recorded"),
  });

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [sessionQ.data, sendM.isPending]);
  useEffect(() => { composerRef.current?.focus(); }, [activeId, sendM.isPending]);

  const submit = () => {
    const q = input.trim();
    if (!q || sendM.isPending) return;
    setInput("");
    sendM.mutate({ sessionId: activeId, question: q });
  };

  const messages: any[] = sessionQ.data?.messages ?? [];
  const groupedPrompts = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const p of promptsQ.data ?? []) (g[(p as any).category] ??= []).push(p);
    return g;
  }, [promptsQ.data]);

  const quickActions = [
    "Today's arrivals",
    "VIP guests arriving this week",
    "Housekeeping priorities right now",
    "This month's revenue summary",
    "Prepare a briefing on our next VIP guest",
    "Show operational alerts",
    "Search knowledge base for late checkout policy",
    "Marketing summary for this week",
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mtoni AI Staff Copilot"
        description="Ask questions across guests, operations, revenue, marketing, and the knowledge base. AI recommends — staff decide."
        actions={
          <Button size="sm" variant="outline" onClick={() => { setActiveId(null); setInput(""); }}>
            <Plus className="mr-1 size-4" /> New chat
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_280px]">
        {/* Sessions */}
        <SectionCard title="Conversations">
          <ul className="space-y-1 text-sm">
            {(sessionsQ.data ?? []).length === 0 && <li className="text-xs text-muted-foreground">No conversations yet.</li>}
            {(sessionsQ.data ?? []).map((s: any) => (
              <li key={s.id} className={`group flex items-center justify-between rounded px-2 py-1.5 ${activeId === s.id ? "bg-primary/10" : "hover:bg-muted"}`}>
                <button onClick={() => setActiveId(s.id)} className="flex-1 truncate text-left">
                  <div className="truncate font-medium">{s.title ?? "Untitled"}</div>
                  <div className="text-[10px] text-muted-foreground">{s.message_count ?? 0} msgs</div>
                </button>
                <button onClick={() => delM.mutate(s.id)} className="opacity-0 group-hover:opacity-100" title="Delete">
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Chat */}
        <div className="flex min-h-[600px] flex-col rounded-lg border bg-card">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {!activeId && messages.length === 0 && (
              <div className="space-y-4">
                <div className="rounded-lg border-dashed border bg-muted/30 p-6 text-center">
                  <Sparkles className="mx-auto mb-2 size-6 text-primary" />
                  <h3 className="font-display text-lg">Ready to help</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Ask about arrivals, operations, revenue, marketing, or search the knowledge base.</p>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Quick actions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickActions.map((q) => (
                      <button key={q} onClick={() => setInput(q)} className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted">{q}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} onFeedback={(r) => fbM.mutate({ messageId: m.id, rating: r })} />
            ))}
            {sendM.isPending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="size-2 animate-pulse rounded-full bg-primary" /> Thinking…
              </div>
            )}
          </div>
          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                ref={composerRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Ask the copilot…"
                rows={2}
                disabled={sendM.isPending}
                className="resize-none"
              />
              <Button onClick={submit} disabled={!input.trim() || sendM.isPending} size="icon">
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">The copilot searches and recommends only. It never modifies bookings, statuses, or communications.</p>
          </div>
        </div>

        {/* Sidebar: prompts + analytics */}
        <div className="space-y-3">
          <SectionCard title="Prompt Library">
            <div className="max-h-[400px] space-y-3 overflow-y-auto text-xs">
              {Object.entries(groupedPrompts).map(([cat, list]) => (
                <div key={cat}>
                  <div className="mb-1 font-medium text-muted-foreground">{cat}</div>
                  <ul className="space-y-1">
                    {list.map((p: any) => (
                      <li key={p.id}>
                        <button onClick={() => setInput(p.prompt)} className="w-full rounded border bg-background px-2 py-1 text-left hover:bg-muted">
                          {p.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Copilot Activity">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Stat label="Sessions" value={analyticsQ.data?.sessions ?? 0} />
              <Stat label="Answers" value={analyticsQ.data?.assistant_messages ?? 0} />
              <Stat label="Avg confidence" value={`${Math.round((analyticsQ.data?.avg_confidence ?? 0) * 100)}%`} />
              <Stat label="Avg latency" value={`${Math.round((analyticsQ.data?.avg_duration_ms ?? 0) / 100) / 10}s`} />
            </div>
            {analyticsQ.data?.feedback && Object.keys(analyticsQ.data.feedback).length > 0 && (
              <div className="mt-2 space-y-0.5 text-xs">
                {Object.entries(analyticsQ.data.feedback).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v as number}</span></div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-display text-lg">{value}</div>
    </div>
  );
}

function MessageBubble({ m, onFeedback }: { m: any; onFeedback: (r: string) => void }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const isUser = m.role === "user";
  const conf = Number(m.confidence ?? 0);
  const confLabel = conf >= 0.8 ? "High" : conf >= 0.5 ? "Medium" : "Low";
  const confColor = conf >= 0.8 ? "text-emerald-600" : conf >= 0.5 ? "text-amber-600" : "text-rose-600";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? "bg-primary text-primary-foreground" : "border bg-muted/40"}`}>
        <div className="whitespace-pre-wrap">{m.content}</div>
        {!isUser && m.recommendation && (
          <div className="mt-2 rounded border-l-2 border-primary bg-background/60 p-2 text-xs">
            <span className="font-medium">Recommendation:</span> {m.recommendation}
          </div>
        )}
        {!isUser && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            {m.confidence != null && <span className={confColor}>● {confLabel} confidence ({Math.round(conf * 100)}%)</span>}
            {m.domains_used?.length > 0 && <span>Domains: {m.domains_used.join(", ")}</span>}
            {m.duration_ms && <span>{(m.duration_ms / 1000).toFixed(1)}s</span>}
            <button onClick={() => navigator.clipboard.writeText(m.content)} className="ml-auto inline-flex items-center gap-0.5 hover:text-foreground">
              <Copy className="size-3" /> Copy
            </button>
            <button onClick={() => onFeedback("helpful")} className="inline-flex items-center gap-0.5 hover:text-emerald-600"><ThumbsUp className="size-3" /></button>
            <button onClick={() => onFeedback("needs_improvement")} className="inline-flex items-center gap-0.5 hover:text-amber-600"><ThumbsDown className="size-3" /></button>
            <button onClick={() => onFeedback("incorrect")} className="inline-flex items-center gap-0.5 hover:text-rose-600"><AlertTriangle className="size-3" /></button>
          </div>
        )}
        {!isUser && (m.evidence?.length > 0 || m.citations?.length > 0 || m.tools_used?.length > 0) && (
          <div className="mt-2 border-t pt-2">
            <button onClick={() => setShowEvidence((s) => !s)} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
              {showEvidence ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />} Evidence & sources
            </button>
            {showEvidence && (
              <div className="mt-2 space-y-2 text-[11px]">
                {m.tools_used?.length > 0 && (
                  <div><span className="font-medium">Tools:</span> {m.tools_used.join(", ")}</div>
                )}
                {m.evidence?.length > 0 && (
                  <ul className="space-y-1">
                    {m.evidence.map((e: any, i: number) => (
                      <li key={i} className="rounded bg-background/60 p-1.5">
                        <span className="font-medium">{e.tool}</span>
                        {e.count != null && <span> · {e.count} result(s)</span>}
                        {e.summary && <div className="text-muted-foreground">{e.summary}</div>}
                      </li>
                    ))}
                  </ul>
                )}
                {m.citations?.length > 0 && (
                  <div>
                    <div className="font-medium">Knowledge citations:</div>
                    <ul className="mt-1 space-y-1">
                      {m.citations.map((c: any, i: number) => (
                        <li key={i} className="rounded bg-background/60 p-1.5">
                          <div className="font-medium">{c.document_title}</div>
                          <div className="text-muted-foreground">{c.excerpt}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}