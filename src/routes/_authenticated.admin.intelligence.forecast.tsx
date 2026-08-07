import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Target } from "lucide-react";
import {
  getForecastBoardFn,
  runForecastPassFn,
} from "@/modules/intelligence/predictions/forecast.functions";
import {
  FORECAST_KIND_LABEL,
  type Forecast,
  type ForecastBoard,
} from "@/modules/intelligence/predictions/forecast.types";

export const Route = createFileRoute("/_authenticated/admin/intelligence/forecast")({
  head: () => ({
    meta: [
      { title: "Predictive Intelligence — Mtoni OS" },
      { name: "description", content: "Demand, revenue, operational risk and guest experience forecasts with confidence and reasoning." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ForecastPage,
});

const HORIZONS = [7, 14, 30] as const;

const DirectionIcon = ({ d }: { d: Forecast["direction"] }) =>
  d === "up" ? (
    <TrendingUp className="size-4 text-[color:var(--os-green,currentColor)]" />
  ) : d === "down" ? (
    <TrendingDown className="size-4 text-[color:var(--os-warn,currentColor)]" />
  ) : (
    <Minus className="size-4 text-muted-foreground" />
  );

function ForecastCard({ f }: { f: Forecast }) {
  const value =
    f.predictedValue === null
      ? "—"
      : f.unit === "%"
        ? `${f.predictedValue}%`
        : f.unit.length <= 4 && Number.isNaN(Number(f.unit))
          ? `${f.unit} ${f.predictedValue.toLocaleString()}`
          : `${f.predictedValue.toLocaleString()} ${f.unit}`;

  return (
    <SectionCard
      title={f.label}
      description={`${FORECAST_KIND_LABEL[f.kind]} · target ${f.targetDate}`}
    >
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-2xl font-medium tabular-nums text-foreground">{value}</span>
        <DirectionIcon d={f.direction} />
        {f.lowerBound !== null && f.upperBound !== null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            range {f.lowerBound.toLocaleString()}–{f.upperBound.toLocaleString()}
          </span>
        )}
        {f.baselineValue !== null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            baseline {f.baselineValue.toLocaleString()}
          </span>
        )}
        <Badge variant="outline" className="text-[0.65rem]">
          confidence {Math.round(f.confidence * 100)}%
        </Badge>
        <Badge variant="secondary" className="text-[0.65rem] uppercase">{f.module}</Badge>
        {f.severity !== "info" && (
          <Badge variant="outline" className="text-[0.65rem] capitalize">{f.severity}</Badge>
        )}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.statement}</p>

      <div className="mt-3">
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Why</p>
        <ul className="mt-1 space-y-1">
          {f.drivers.map((d) => (
            <li key={d.label} className="text-sm text-muted-foreground">
              <span className="text-foreground">{d.label}</span> — {d.detail}
              <span className="ml-1 text-[0.65rem]">
                ({d.weight > 0 ? "+" : ""}{Math.round(d.weight * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>

      {f.recommendation && (
        <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Target className="size-4" /> {f.recommendation.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{f.recommendation.suggestedAction}</p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">Expected impact: {f.recommendation.impact}</p>
        </div>
      )}
    </SectionCard>
  );
}

function ForecastPage() {
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState<number>(14);
  const boardFn = useServerFn(getForecastBoardFn);
  const runFn = useServerFn(runForecastPassFn);

  const q = useQuery({
    queryKey: ["intel.forecast", horizon],
    queryFn: () => boardFn({ data: { horizonDays: horizon } }) as Promise<ForecastBoard>,
  });

  const run = useMutation({
    mutationFn: () => runFn({ data: { horizonDays: horizon, persist: true } }),
    onSuccess: (r) => {
      toast.success(
        `Prediction pass — ${r.predictionsRecorded} predictions recorded, ${r.recommendationsCreated} recommendations created.`,
      );
      qc.invalidateQueries({ queryKey: ["intel.forecast"] });
      qc.invalidateQueries({ queryKey: ["intel.timeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const board = q.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Predictive Intelligence"
        description="What is likely to happen next — demand, revenue, operational risk and guest experience, each with drivers, confidence and the action it justifies."
        actions={
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            <RefreshCw className={`mr-1.5 size-4 ${run.isPending ? "animate-spin" : ""}`} />
            Run prediction pass
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1 text-sm">
        {HORIZONS.map((h) => (
          <button
            key={h}
            onClick={() => setHorizon(h)}
            className={`rounded px-3 py-1.5 ${
              horizon === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {h} days
          </button>
        ))}
      </div>

      {!board ? (
        <SectionCard title="Forecast">
          <EmptyState
            title={q.isLoading ? "Running the prediction engine…" : "No forecast available"}
            description="The engine combines historical data, current context, business patterns, seasonality and memory."
          />
        </SectionCard>
      ) : (
        <>
          <SectionCard
            title="Outlook"
            description={`Generated ${new Date(board.generated_at).toLocaleString()} · ${board.horizon_days}-day horizon`}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">{board.headline}</p>
          </SectionCard>

          {board.forecasts.length === 0 ? (
            <SectionCard title="Forecasts">
              <EmptyState title="Not enough data yet" description="Forecasts appear once reservations and rate history exist for the window." />
            </SectionCard>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {board.forecasts.map((f) => (
                <ForecastCard key={f.key} f={f} />
              ))}
            </div>
          )}

          <SectionCard
            title="Prediction accuracy"
            description="Scored predictions feed the Learn stage so future forecasts improve."
          >
            {board.accuracy.scored === 0 ? (
              <p className="text-sm text-muted-foreground">
                No predictions scored against reality yet. Accuracy appears once outcomes are recorded.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  {board.accuracy.scored} scored predictions · average accuracy{" "}
                  {Math.round((board.accuracy.averageAccuracy ?? 0) * 100)}%
                </p>
                <ul className="space-y-1">
                  {board.accuracy.byKind.map((k) => (
                    <li key={k.predictionKey} className="text-sm text-muted-foreground">
                      <span className="text-foreground">{k.predictionKey}</span> — {k.scored} scored,{" "}
                      {Math.round(k.averageAccuracy * 100)}% accurate
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}