import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Brain, CheckCircle2, Lightbulb, Loader2, Radio, RefreshCw, Send, ShieldCheck, Sparkles, Target } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { askAi, getMyAiScope } from "@/domains/ai/ai.functions";
import type { AiResponse } from "@/domains/ai/ai.types";
import { getIntelligenceTimelineFn, runIntelligencePipeline } from "@/modules/intelligence/activation/activation.functions";
import type { TimelineEntry, TimelineStage } from "@/modules/intelligence/timeline/timeline.server";

export const Route = createFileRoute("/_authenticated/admin/ai/")({
  head: () => ({ meta: [
    { title: "StayNas Intelligence Centre" },
    { name: "description", content: "StayNas AI intelligence, reasoning, recommendations and execution context." },
    { name: "robots", content: "noindex,nofollow" },
  ] }),
  component: IntelligenceCentre,
});

const STAGE_META: Record<TimelineStage, { label: string; icon: typeof Radio }> = {
  observe: { label: "Observe", icon: Radio }, understand: { label: "Understand", icon: Activity },
  reason: { label: "Reason", icon: Brain }, recommend: { label: "Recommend", icon: Lightbulb },
  decide: { label: "Decide", icon: Target }, plan: { label: "Plan", icon: ArrowRight },
  act: { label: "Act", icon: CheckCircle2 }, learn: { label: "Learn", icon: Brain },
};
const STAGES: TimelineStage[] = ["observe","understand","reason","recommend","decide","plan","act","learn"];
const SUGGESTIONS = [
  "Give me the operational picture for today.",
  "What should management pay attention to right now?",
  "Which guests or arrivals need attention?",
  "What revenue opportunities are visible?",
];
type Turn = { role: "user" | "assistant"; content: string; response?: AiResponse; error?: string };

function IntelligenceCentre() {
  const qc = useQueryClient();
  const askFn = useServerFn(askAi);
  const scopeFn = useServerFn(getMyAiScope);
  const timelineFn = useServerFn(getIntelligenceTimelineFn);
  const pipelineFn = useServerFn(runIntelligencePipeline);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scopeQ = useQuery({ queryKey: ["ai.scope"], queryFn: () => scopeFn() });
  const timelineQ = useQuery({ queryKey: ["intel.timeline","centre"], queryFn: () => timelineFn({ data: { limit: 40 } }) });

  const ask = useMutation({
    mutationFn: (question: string) => askFn({ data: { question } }),
    onSuccess: (response) => setTurns((t) => [...t, { role: "assistant", content: response.answer, response }]),
    onError: (e: Error) => setTurns((t) => [...t, { role: "assistant", content: "", error: e.message }]),
  });
  const run = useMutation({
    mutationFn: () => pipelineFn({ data: { windowHours: 24 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel.timeline","centre"] });
      qc.invalidateQueries({ queryKey: ["intel.health"] });
    },
  });
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [turns, ask.isPending]);

  const entries = (timelineQ.data ?? []) as TimelineEntry[];
  const active = useMemo(() => new Set(entries.map((e) => e.stage)), [entries]);
  const recommendations = entries.filter((e) => e.stage === "recommend").slice(0, 4);
  const risks = entries.filter((e) => e.severity && ["high","critical"].includes(String(e.severity).toLowerCase())).slice(0, 4);
  const submit = (value: string) => {
    const question = value.trim();
    if (!question || ask.isPending) return;
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    ask.mutate(question);
  };

  return <div className="space-y-5">
    <PageHeader title="StayNas Intelligence Centre" description="One intelligence surface for live signals, reasoning, recommendations and AI-assisted decisions across the property."
      actions={<Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending}><RefreshCw className={`mr-1.5 size-4 ${run.isPending ? "animate-spin" : ""}`} />Run reasoning pass</Button>} />

    <div className="grid gap-3 md:grid-cols-4">
      {STAGES.slice(0,4).map((stage) => { const meta=STAGE_META[stage]; const Icon=meta.icon; const count=entries.filter(e=>e.stage===stage).length;
        return <div key={stage} className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between"><span className="text-xs uppercase tracking-wide text-muted-foreground">{meta.label}</span><Icon className="size-4 text-primary"/></div><div className="mt-2 text-2xl font-semibold">{active.has(stage) ? "Active" : "—"}</div><div className="mt-1 text-xs text-muted-foreground">{count} recent records</div></div>;
      })}
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
      <SectionCard title="Ask StayNas AI" description="Query live property data and the knowledge base within your role scope.">
        <div className="flex min-h-[420px] flex-col">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {turns.length===0 ? <div className="space-y-4 rounded-xl border border-dashed p-6">
              <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary"/><div><div className="font-medium">Operational intelligence, on demand</div><div className="text-xs text-muted-foreground">Responses are grounded in permitted live data and knowledge.</div></div></div>
              <div className="grid gap-2 sm:grid-cols-2">{SUGGESTIONS.map((s)=><button key={s} type="button" onClick={()=>submit(s)} className="rounded-lg border bg-background px-3 py-2 text-left text-xs hover:bg-muted">{s}</button>)}</div>
            </div> : turns.map((t,i)=><TurnBubble key={i} turn={t}/>)}
            {ask.isPending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin"/>Reasoning…</div>}
          </div>
          <form className="mt-4 flex items-end gap-2 border-t pt-3" onSubmit={(e)=>{e.preventDefault();submit(input);}}>
            <Textarea value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit(input);}}} placeholder="Ask about operations, guests, reservations, revenue or property performance…" className="min-h-[58px] resize-none" disabled={ask.isPending}/>
            <Button type="submit" size="icon" disabled={ask.isPending||!input.trim()} aria-label="Ask StayNas AI"><Send className="size-4"/></Button>
          </form>
        </div>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title="Intelligence loop"><div className="space-y-2">{STAGES.map((stage,i)=>{const meta=STAGE_META[stage];const Icon=meta.icon;return <div key={stage} className="flex items-center gap-2 rounded-lg border bg-background/50 px-3 py-2"><Icon className={`size-3.5 ${active.has(stage)?"text-primary":"text-muted-foreground"}`}/><span className="text-xs font-medium">{meta.label}</span>{i<STAGES.length-1&&<ArrowRight className="ml-auto size-3 text-muted-foreground"/>}</div>;})}</div></SectionCard>
        <SectionCard title="Access scope"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4"/>Role-scoped intelligence</div><div className="mt-2 flex flex-wrap gap-1">{(scopeQ.data?.roles??[]).map(r=><Badge key={r} variant="secondary">{r}</Badge>)}</div><p className="mt-2 text-xs text-muted-foreground">{scopeQ.data?.tools?.length??0} intelligence tools available to your role.</p></SectionCard>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Latest recommendations" description="Recommendations generated by the intelligence core.">{recommendations.length===0?<EmptyState title="No recommendations yet" description="Run a reasoning pass after new operational events are observed."/>:<div className="space-y-2">{recommendations.map(e=><div key={e.id} className="rounded-lg border p-3"><div className="flex items-start gap-2"><Lightbulb className="mt-0.5 size-4 text-primary"/><div className="min-w-0"><div className="text-sm font-medium">{e.title}</div>{e.detail&&<div className="mt-1 text-xs text-muted-foreground">{e.detail}</div>}<div className="mt-2 flex flex-wrap gap-1"><Badge variant="outline">{e.module}</Badge>{e.status&&<Badge variant="secondary">{e.status}</Badge>}{e.confidence!=null&&<Badge variant="outline">{Math.round(Number(e.confidence)*100)}% confidence</Badge>}</div></div></div></div>)}</div>}</SectionCard>
      <SectionCard title="Attention required" description="High-severity intelligence records currently visible to your role.">{risks.length===0?<EmptyState title="No high-severity records" description="No high or critical severity items are currently visible."/>:<div className="space-y-2">{risks.map(e=><div key={e.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 text-destructive"/><div><div className="text-sm font-medium">{e.title}</div>{e.detail&&<div className="mt-1 text-xs text-muted-foreground">{e.detail}</div>}<div className="mt-2 flex gap-1"><Badge variant="outline">{e.module}</Badge>{e.status&&<Badge variant="secondary">{e.status}</Badge>}</div></div></div></div>)}</div>}</SectionCard>
    </div>

    <SectionCard title="Recent intelligence activity" description={timelineQ.isFetching ? "Refreshing…" : entries.length + " records in the current view."}>
      {entries.length===0?<EmptyState title="No intelligence activity yet" description="StayNas will populate this surface as operational events flow through the intelligence core."/>:<div className="space-y-2">{entries.slice(0,12).map(e=>{const meta=STAGE_META[e.stage];const Icon=meta.icon;return <div key={e.id} className="flex items-start gap-3 rounded-lg border bg-background/40 p-3"><Icon className="mt-0.5 size-4 shrink-0 text-primary"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{e.title}</span><Badge variant="outline">{meta.label}</Badge><Badge variant="secondary">{e.module}</Badge></div>{e.detail&&<div className="mt-1 text-xs text-muted-foreground">{e.detail}</div>}</div>{e.confidence!=null&&<span className="shrink-0 text-[10px] text-muted-foreground">{Math.round(Number(e.confidence)*100)}%</span>}</div>;})}</div>}
    </SectionCard>
    <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"><span>StayNas Intelligence Centre · Observe → Understand → Reason → Recommend → Decide → Plan → Act → Learn</span><span>{scopeQ.data?.tools?.length??0} permitted AI tools</span></div>
  </div>;
}

function TurnBubble({turn}:{turn:Turn}) {
  if(turn.role==="user") return <div className="flex justify-end"><div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.content}</div></div>;
  if(turn.error) return <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{turn.error}</div>;
  const r=turn.response;
  return <div className="space-y-2"><div className="rounded-lg border bg-card p-3 text-sm"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="size-3.5"/>StayNas AI</div><div className="whitespace-pre-wrap">{turn.content}</div>{r?.recommendation&&<div className="mt-3 rounded-md border-l-2 border-primary bg-primary/5 p-2 text-xs"><span className="font-medium">Recommendation:</span> {r.recommendation}</div>}</div>{r?.evidence?.length?<div className="flex flex-wrap gap-1">{r.evidence.map((x,i)=><Badge key={i} variant="outline" className="text-[10px]">{x.domain} · {x.tool}</Badge>)}</div>:null}</div>;
}
