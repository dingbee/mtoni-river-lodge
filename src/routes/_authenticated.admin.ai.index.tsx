import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { askAi, getMyAiScope } from "@/domains/ai/ai.functions";
import type { AiResponse } from "@/domains/ai/ai.types";

export const Route = createFileRoute("/_authenticated/admin/ai/")({
  head: () => ({ meta: [{ title: "Command Centre — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CommandCentre,
});

const SUGGESTIONS = [
  "How is occupancy performing this month?",
  "Who are today's arrivals?",
  "Show unpaid balances.",
  "What are the biggest operational issues today?",
  "List departures today.",
  "Recent published journal articles.",
];

type Turn = { role: "user" | "assistant"; content: string; response?: AiResponse; error?: string };

function CommandCentre() {
  const askFn = useServerFn(askAi);
  const scopeFn = useServerFn(getMyAiScope);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scope = useQuery({ queryKey: ["ai.scope"], queryFn: () => scopeFn() });

  const ask = useMutation({
    mutationFn: (question: string) => askFn({ data: { question } }),
    onSuccess: (r) => setTurns((t) => [...t, { role: "assistant", content: r.answer, response: r }]),
    onError: (e: any) => setTurns((t) => [...t, { role: "assistant", content: "", error: e?.message ?? "Something went wrong." }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, ask.isPending]);

  const submit = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    ask.mutate(question);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mtoni AI Command Centre"
        description="Ask questions about reservations, guests, finance, operations and marketing. Answers are grounded in your live Mtoni OS data and respect your role."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <SectionCard className="flex flex-col min-h-[560px]">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-1">
            {turns.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Sparkles className="mx-auto mb-2 size-6 text-primary" />
                Ask Mtoni AI anything about the property. Every answer cites the domain and tool it used.
              </div>
            ) : (
              turns.map((t, i) => <TurnBubble key={i} turn={t} />)
            )}
            {ask.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          <form
            className="mt-4 flex items-end gap-2 border-t pt-3"
            onSubmit={(e) => { e.preventDefault(); submit(input); }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about occupancy, arrivals, unpaid balances, alerts…"
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input); }
              }}
              disabled={ask.isPending}
            />
            <Button type="submit" disabled={ask.isPending || !input.trim()}>
              {ask.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </SectionCard>

        <div className="space-y-3">
          <SectionCard title="Suggested questions">
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                  disabled={ask.isPending}
                >
                  {s}
                </button>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Your access">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="size-4" /> Roles
              </div>
              <div className="flex flex-wrap gap-1">
                {(scope.data?.roles ?? []).map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                {scope.data && scope.data.roles.length === 0 && <span className="text-muted-foreground">No roles assigned</span>}
              </div>
              <div className="pt-2 text-xs text-muted-foreground">
                {scope.data?.tools?.length ?? 0} AI tools available for your role.
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.content}</div>
      </div>
    );
  }
  if (turn.error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4" /> {turn.error}
      </div>
    );
  }
  const r = turn.response;
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-card p-3 text-sm">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" /> Mtoni AI
        </div>
        <div className="whitespace-pre-wrap">{turn.content}</div>
        {r?.recommendation && (
          <div className="mt-3 rounded-md border-l-2 border-primary bg-primary/5 p-2 text-xs">
            <span className="font-medium">Recommendation:</span> {r.recommendation}
          </div>
        )}
      </div>
      {r?.evidence && r.evidence.length > 0 && (
        <div className="flex flex-wrap gap-1 text-xs">
          {r.evidence.map((e, i) => (
            <Badge key={i} variant="outline">
              {e.domain} · {e.tool}{typeof e.count === "number" ? ` · ${e.count}` : ""}{e.window ? ` · ${e.window}` : ""}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}