import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ShieldCheck, Info, AlertTriangle, Check, X, ListChecks } from "lucide-react";
import {
  generateGuestBriefing,
  generateOpportunities,
  listRecommendations,
  actionRecommendation,
} from "@/domains/ai/guest-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/guests/$bookingId")({
  head: () => ({ meta: [{ title: "Guest Briefing — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: BriefingPage,
});

function BriefingPage() {
  const { bookingId } = Route.useParams();
  const qc = useQueryClient();
  const briefFn = useServerFn(generateGuestBriefing);
  const oppFn = useServerFn(generateOpportunities);
  const listFn = useServerFn(listRecommendations);
  const actFn = useServerFn(actionRecommendation);

  const [briefing, setBriefing] = useState<any>(null);
  const [opps, setOpps] = useState<any>(null);

  const recs = useQuery({
    queryKey: ["ai.guest.recs", bookingId],
    queryFn: () => listFn({ data: { bookingId } }),
  });

  const brief = useMutation({
    mutationFn: () => briefFn({ data: { bookingId, persist: true } }),
    onSuccess: (r) => { setBriefing(r); qc.invalidateQueries({ queryKey: ["ai.guest.recs", bookingId] }); },
  });
  const opp = useMutation({
    mutationFn: () => oppFn({ data: { bookingId, persist: true } }),
    onSuccess: (r) => { setOpps(r); qc.invalidateQueries({ queryKey: ["ai.guest.recs", bookingId] }); },
  });
  const act = useMutation({
    mutationFn: (v: { id: string; action: "accept" | "dismiss" | "convert" }) => actFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai.guest.recs", bookingId] }),
  });

  const ctx = briefing?.context;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Guest briefing"
        description="Every recommendation is grounded in Mtoni OS data and cites its reasoning."
        actions={<Button asChild variant="outline" size="sm"><Link to="/admin/ai/guests">← Back to arrivals</Link></Button>}
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => brief.mutate()} disabled={brief.isPending}>
          {brief.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
          Generate briefing
        </Button>
        <Button variant="outline" onClick={() => opp.mutate()} disabled={opp.isPending}>
          {opp.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ListChecks className="mr-2 size-4" />}
          Recommend opportunities
        </Button>
      </div>

      {brief.isError && <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{(brief.error as Error).message}</div>}

      {briefing && (
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Guest summary" className="lg:col-span-2">
            <div className="whitespace-pre-wrap text-sm">{briefing.summary}</div>
            {ctx?.guest && (
              <div className="mt-3 flex flex-wrap gap-1 text-xs">
                <Badge variant="secondary">{ctx.guest.full_name}</Badge>
                {ctx.guest.nationality && <Badge variant="outline">{ctx.guest.nationality}</Badge>}
                {ctx.guest.preferred_language && <Badge variant="outline">{ctx.guest.preferred_language}</Badge>}
                {ctx.guest.vip_since && <Badge>VIP</Badge>}
                <Badge variant="outline">{ctx.booking.check_in} → {ctx.booking.check_out}</Badge>
                <Badge variant="outline">{ctx.booking.adults}A{ctx.booking.children ? ` + ${ctx.booking.children}C` : ""}</Badge>
                {ctx.room?.name && <Badge variant="outline">{ctx.room.name}</Badge>}
                <Badge variant="outline">{ctx.history.length} previous stay(s)</Badge>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Health score">
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-display">{briefing.health.score}</div>
              <Badge variant="secondary" className="uppercase">{briefing.health.tier}</Badge>
            </div>
            <ul className="mt-3 space-y-1 text-xs">
              {briefing.health.dimensions.map((d: any) => (
                <li key={d.key} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{d.key.replace(/_/g, " ")}</span>
                  <span>{Math.round(d.value * 100)}% · <span className="text-muted-foreground">{d.note}</span></span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {ctx && (
            <SectionCard title="Preferences & notes" className="lg:col-span-2">
              {ctx.preferences.length === 0 && ctx.notes.length === 0 ? (
                <div className="text-sm text-muted-foreground">No preferences or notes recorded.</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {ctx.preferences.map((p: any, i: number) => (
                    <div key={i} className="flex gap-2 text-xs"><Badge variant="outline">{p.category}</Badge><span className="font-medium">{p.key}:</span> <span className="text-muted-foreground">{String(p.value)}</span></div>
                  ))}
                  {ctx.notes.map((n: any, i: number) => (
                    <div key={i} className="rounded border-l-2 border-muted-foreground/20 pl-2 text-xs text-muted-foreground">{n.body}</div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard title="Alerts">
            {briefing.alerts.length === 0 ? <div className="text-sm text-muted-foreground">No alerts.</div> : (
              <ul className="space-y-2 text-sm">
                {briefing.alerts.map((a: any, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className={"mt-0.5 size-4 " + (a.severity === "warning" ? "text-amber-600" : "text-muted-foreground")} />
                    <div><div className="font-medium">{a.title}</div><div className="text-xs text-muted-foreground">{a.detail}</div></div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      <SectionCard title="Recommendations">
        {recs.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : (recs.data ?? []).length === 0 ? (
          <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">Generate a briefing or opportunities to see recommendations.</div>
        ) : (
          <ul className="divide-y">
            {(recs.data as any[]).map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{r.kind}</Badge>
                      <span className="font-medium">{r.title}</span>
                      {typeof r.confidence === "number" && <Badge variant="secondary">conf {Math.round(r.confidence * 100)}%</Badge>}
                      {r.expected_value && <Badge variant="secondary">≈ ${Number(r.expected_value).toFixed(0)}</Badge>}
                      {r.status !== "pending" && <Badge>{r.status}</Badge>}
                    </div>
                    <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      <span>{r.reasoning}</span>
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "dismiss" })}><X className="size-4" /></Button>
                      <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "accept" })}><Check className="mr-1 size-4" /> Accept</Button>
                      <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, action: "convert" })}>Create task</Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" /> Every recommendation is stored with its reasoning and appears in the AI Activity log.
      </div>
    </div>
  );
}