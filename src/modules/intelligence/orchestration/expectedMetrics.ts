/**
 * Sprint 6 — Expected outcome metrics (pure).
 *
 * A decision is only measurable if we say, at approval time, what "better"
 * means in numbers. These targets are captured before execution so the core
 * cannot move the goalposts afterwards.
 */
import type { BusinessContext } from "../context/context.types";
import type { ExpectedMetric } from "./orchestration.types";

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Targets are derived from the decision domain and the context captured at
 * approval. Baselines are always recorded so achievement is measured as
 * movement, not as an absolute.
 */
export function deriveExpectedMetrics(domain: string, ctx: BusinessContext): ExpectedMetric[] {
  const occ = ctx.occupancy;
  const rev = ctx.revenue;

  switch (domain) {
    case "occupancy":
    case "demand":
      return [
        {
          metricKey: "occupancy.current",
          label: "Occupancy",
          comparator: "gte",
          unit: "%",
          baselineValue: round(occ.current),
          targetValue: round(Math.min(96, occ.current + Math.max(4, (occ.historical_average - occ.current) * 0.6))),
          measureAfterHours: 168,
          source: "business_context.occupancy.current",
        },
        {
          metricKey: "revenue.adr",
          label: "Average daily rate (guardrail)",
          comparator: "gte",
          unit: rev.currency,
          baselineValue: round(rev.adr),
          targetValue: round(rev.adr * 0.95),
          measureAfterHours: 168,
          source: "business_context.revenue.adr",
        },
      ];

    case "pricing":
    case "revenue":
      return [
        {
          metricKey: "revenue.adr",
          label: "Average daily rate",
          comparator: rev.risk === "overpricing" ? "lte" : "gte",
          unit: rev.currency,
          baselineValue: round(rev.adr),
          targetValue: round(rev.risk === "overpricing" ? rev.adr * 0.94 : rev.adr * 1.05),
          measureAfterHours: 336,
          source: "business_context.revenue.adr",
        },
        {
          metricKey: "occupancy.forecast",
          label: "Forecast occupancy (guardrail)",
          comparator: "gte",
          unit: "%",
          baselineValue: round(occ.forecast),
          targetValue: round(Math.max(0, occ.forecast - 3)),
          measureAfterHours: 336,
          source: "business_context.occupancy.forecast",
        },
      ];

    case "operations":
    case "readiness":
      return [
        {
          metricKey: "operations.open_intelligence_tasks",
          label: "Open intelligence tasks",
          comparator: "lte",
          unit: "tasks",
          baselineValue: null,
          targetValue: 0,
          measureAfterHours: 72,
          source: "ops_tasks",
        },
      ];

    case "guest":
    case "experience":
      return [
        {
          metricKey: "guest.vip_preparation_completed",
          label: "VIP preparation completed",
          comparator: "boolean",
          unit: null,
          baselineValue: 0,
          targetValue: 1,
          measureAfterHours: 48,
          source: "ops_tasks",
        },
      ];

    case "marketing":
      return [
        {
          metricKey: "occupancy.forecast",
          label: "Forecast occupancy",
          comparator: "gte",
          unit: "%",
          baselineValue: round(occ.forecast),
          targetValue: round(Math.min(96, occ.forecast + 5)),
          measureAfterHours: 336,
          source: "business_context.occupancy.forecast",
        },
      ];

    default:
      return [
        {
          metricKey: "operations.open_intelligence_tasks",
          label: "Follow-up work closed",
          comparator: "lte",
          unit: "tasks",
          baselineValue: null,
          targetValue: 0,
          measureAfterHours: 72,
          source: "ops_tasks",
        },
      ];
  }
}

/** Values the verifier can read straight from a fresh business context. */
export function contextMetricValue(metricKey: string, ctx: BusinessContext): number | null {
  switch (metricKey) {
    case "occupancy.current":
      return ctx.occupancy.current;
    case "occupancy.forecast":
      return ctx.occupancy.forecast;
    case "revenue.adr":
      return ctx.revenue.adr;
    default:
      return null;
  }
}