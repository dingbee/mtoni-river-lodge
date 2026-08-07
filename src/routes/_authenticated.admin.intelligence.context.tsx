import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Badge } from "@/components/ui/badge";
import { getBusinessContextFn } from "@/modules/intelligence/context/context.functions";
import { MEMORY_TIER_LABEL, type BusinessContext, type MemoryTier } from "@/modules/intelligence/context/context.types";

export const Route = createFileRoute("/_authenticated/admin/intelligence/context")({
  head: () => ({
    meta: [
      { title: "Business Context — Mtoni OS" },
      { name: "description", content: "Occupancy, revenue, guest, seasonal and memory context behind every Mtoni recommendation." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ContextPage,
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-[0.68rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const TIERS: MemoryTier[] = ["observed", "learned", "strategic"];

function ContextPage() {
  const fn = useServerFn(getBusinessContextFn);
  const q = useQuery({
    queryKey: ["intel.context"],
    queryFn: () => fn({ data: { windowDays: 14 } }) as Promise<BusinessContext>,
  });
  const c = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Business Context"
        description="What Mtoni understands about the business right now — live data, history, business rules and curated memory combined."
      />

      {!c ? (
        <SectionCard title="Context">
          <EmptyState title={q.isLoading ? "Building context…" : "No context available"} description="The context engine reads reservations, rooms, guests and memory." />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Understanding" description={`Generated ${new Date(c.generated_at).toLocaleString()}`}>
            <ul className="space-y-2">
              {c.narrative.map((line) => (
                <li key={line} className="text-sm leading-relaxed text-muted-foreground">{line}</li>
              ))}
            </ul>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Occupancy context" description={`${c.occupancy.rooms_total} rooms · confidence ${Math.round(c.occupancy.confidence * 100)}%`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Current" value={`${c.occupancy.current}%`} />
                <Metric label="Forecast" value={`${c.occupancy.forecast}%`} hint={`${c.occupancy.window_days} days`} />
                <Metric label="Historical" value={`${c.occupancy.historical_average}%`} hint="90-day avg" />
                <Metric label="Trend" value={c.occupancy.trend} />
              </div>
            </SectionCard>

            <SectionCard title="Revenue context" description={`Confidence ${Math.round(c.revenue.confidence * 100)}%`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="ADR" value={`${c.revenue.currency} ${c.revenue.adr}`} />
                <Metric label="Baseline" value={`${c.revenue.currency} ${c.revenue.adr_baseline}`} />
                <Metric label="Position" value={c.revenue.adr_position.replace("_", " ")} />
                <Metric label="Pace" value={c.revenue.booking_pace} hint={`risk: ${c.revenue.risk}`} />
              </div>
            </SectionCard>

            <SectionCard title="Guest context" description={`Confidence ${Math.round(c.guest.confidence * 100)}%`}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="New bookings" value={String(c.guest.new_reservations)} />
                <Metric label="Returning" value={`${c.guest.returning_guests}`} hint={`${c.guest.returning_share}% of intake`} />
                <Metric label="High value" value={String(c.guest.high_value_guests)} />
                <Metric label="VIP" value={String(c.guest.vip_arrivals)} />
              </div>
              {c.guest.top_preferences.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.guest.top_preferences.map((p) => (
                    <Badge key={p} variant="outline" className="text-[0.65rem]">{p}</Badge>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Seasonal context" description={c.seasonal.pattern}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Month" value={c.seasonal.month} />
                <Metric label="Season" value={c.seasonal.season} />
                <Metric label="Month to date" value={String(c.seasonal.current_month_to_date)} />
                <Metric
                  label="Vs last year"
                  value={c.seasonal.yoy_delta_pct === null ? "—" : `${c.seasonal.yoy_delta_pct > 0 ? "+" : ""}${c.seasonal.yoy_delta_pct}%`}
                  hint={`${c.seasonal.same_month_last_year} last year`}
                />
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Intelligence memory" description="Observed facts, learned patterns and strategic preferences influencing every recommendation.">
            <div className="grid gap-4 lg:grid-cols-3">
              {TIERS.map((tier) => (
                <div key={tier}>
                  <p className="text-xs font-medium capitalize text-foreground">{tier}</p>
                  <p className="mb-2 text-[0.65rem] text-muted-foreground">{MEMORY_TIER_LABEL[tier]}</p>
                  {c.memory[tier].length === 0 ? (
                    <p className="text-sm text-muted-foreground">No approved entries yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {c.memory[tier].map((m) => (
                        <li key={m.key} className="rounded border border-border/60 bg-background/40 p-2 text-sm text-muted-foreground">
                          <span className="text-foreground">{m.key}</span> — {m.value}
                          <span className="ml-1 text-[0.65rem]">({Math.round(m.confidence * 100)}%)</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
