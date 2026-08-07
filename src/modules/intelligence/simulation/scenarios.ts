/**
 * Sprint 7 — End-to-end intelligence simulation fixtures.
 *
 * Synthetic business contexts and forecasts that exercise the real, pure
 * reasoning path (context → prediction → decision → plan). Nothing here reads
 * or writes the database: a simulation must never touch live intelligence data.
 */
import type { BusinessContext, MemoryContext } from "../context/context.types";
import type { Forecast, ForecastKind } from "../predictions/forecast.types";

export type ScenarioKey = "high_demand" | "low_demand" | "operational_pressure";

export interface SimulationScenario {
  key: ScenarioKey;
  label: string;
  description: string;
  inputs: string[];
  expectations: string[];
  context: BusinessContext;
  forecasts: Forecast[];
}

const STRATEGIC_MEMORY: MemoryContext["strategic"] = [
  {
    key: "positioning.no_discounting",
    value: "Mtoni holds premium positioning — no broad discounting of published rates.",
    confidence: 0.95,
  },
  {
    key: "channel.direct_first",
    value: "Direct bookings are preferred over OTA commission-heavy volume.",
    confidence: 0.9,
  },
  {
    key: "service.standard",
    value: "Personal service standards are never reduced to save operational time.",
    confidence: 0.9,
  },
];

function memory(strategic = STRATEGIC_MEMORY): MemoryContext {
  return {
    observed: [{ key: "pickup.window", value: "Most bookings land 12–18 days out.", confidence: 0.7 }],
    learned: [{ key: "repeat.conversion", value: "Repeat-guest offers convert ~3x public offers.", confidence: 0.72 }],
    strategic,
  };
}

function forecast(partial: Partial<Forecast> & { key: string; kind: ForecastKind }): Forecast {
  return {
    module: "platform",
    label: partial.key,
    horizonDays: 14,
    targetDate: "2026-09-01",
    predictedValue: null,
    lowerBound: null,
    upperBound: null,
    unit: "%",
    baselineValue: null,
    direction: "flat",
    severity: "info",
    confidence: 0.7,
    statement: "",
    drivers: [],
    reasoningSources: ["simulation"],
    recommendation: null,
    evidence: {},
    ...partial,
  };
}

function context(over: {
  occupancyCurrent: number;
  occupancyForecast: number;
  occupancyAverage: number;
  trend: BusinessContext["occupancy"]["trend"];
  adr: number;
  adrBaseline: number;
  adrPosition: BusinessContext["revenue"]["adr_position"];
  pace: BusinessContext["revenue"]["booking_pace"];
  vip: number;
  returning: number;
  narrative: string[];
  strategic?: MemoryContext["strategic"];
}): BusinessContext {
  return {
    generated_at: "2026-08-01T00:00:00.000Z",
    occupancy: {
      current: over.occupancyCurrent,
      forecast: over.occupancyForecast,
      historical_average: over.occupancyAverage,
      trend: over.trend,
      confidence: 0.78,
      rooms_total: 24,
      window_days: 14,
    },
    guest: {
      new_reservations: 18,
      returning_guests: over.returning,
      returning_share: Math.round((over.returning / Math.max(1, over.returning + 18)) * 100) / 100,
      high_value_guests: over.vip,
      top_preferences: ["river-facing room", "early breakfast"],
      vip_arrivals: over.vip,
      confidence: 0.75,
    },
    revenue: {
      adr: over.adr,
      adr_baseline: over.adrBaseline,
      adr_position: over.adrPosition,
      booking_pace: over.pace,
      revenue_window: Math.round(over.adr * 24 * 14 * (over.occupancyForecast / 100)),
      risk: over.adrPosition === "below_market" ? "underpricing" : "balanced",
      currency: "USD",
      confidence: 0.76,
    },
    seasonal: {
      month: "September",
      season: "high",
      same_month_last_year: 71,
      current_month_to_date: over.occupancyCurrent,
      yoy_delta_pct: 8,
      pattern: "High season pickup accelerates from mid-month.",
      confidence: 0.7,
    },
    memory: memory(over.strategic),
    narrative: over.narrative,
  };
}

/* ------------------------------- scenarios ------------------------------- */

const highDemand: SimulationScenario = {
  key: "high_demand",
  label: "High demand",
  description: "Bookings are rising, returning VIP guests are arriving and ADR sits below the market band.",
  inputs: ["Rising booking pace", "Returning VIP guests in the window", "ADR below market band"],
  expectations: [
    "A revenue decision is produced with a ranked option set",
    "Broad discounting is excluded by strategic memory",
    "The decision requires management approval",
    "An executable plan with monitoring and outcome capture is generated",
    "A guest-experience decision prepares the VIP arrivals",
  ],
  context: context({
    occupancyCurrent: 74,
    occupancyForecast: 86,
    occupancyAverage: 68,
    trend: "increasing",
    adr: 232,
    adrBaseline: 280,
    adrPosition: "below_market",
    pace: "accelerating",
    vip: 4,
    returning: 9,
    narrative: ["Demand is building faster than the seasonal average while rate sits below the band."],
  }),
  forecasts: [
    forecast({
      key: "forecast.demand.2026-09-01",
      kind: "demand",
      module: "booking",
      label: "Occupancy forecast",
      predictedValue: 86,
      lowerBound: 79,
      upperBound: 92,
      baselineValue: 68,
      direction: "up",
      severity: "medium",
      confidence: 0.78,
      statement: "Occupancy is likely to reach 86% over the next 14 days, 18 points above the seasonal average.",
      drivers: [
        { label: "Booking pace", detail: "Pickup is accelerating week on week.", weight: 0.4 },
        { label: "Season", detail: "High season pattern repeating.", weight: 0.25 },
      ],
    }),
    forecast({
      key: "forecast.guest.2026-09-01",
      kind: "guest_experience",
      module: "guest",
      label: "Guest experience load",
      predictedValue: 4,
      unit: " VIP arrivals",
      direction: "up",
      severity: "medium",
      confidence: 0.74,
      statement: "Four returning high-value guests arrive inside the window.",
      drivers: [{ label: "Returning guests", detail: "9 repeat guests in the window.", weight: 0.35 }],
    }),
  ],
};

const lowDemand: SimulationScenario = {
  key: "low_demand",
  label: "Low demand",
  description: "Booking pace is declining into a soft occupancy window while strategic memory prohibits discounting.",
  inputs: ["Declining booking pace", "Soft occupancy forecast", "Strategic memory prohibits discounting"],
  expectations: [
    "A demand decision is produced for the soft window",
    "Broad discounting is excluded, not merely ranked lower",
    "The recommended option preserves rate integrity",
    "The exclusion is attributed to strategic memory in the reasoning",
  ],
  context: context({
    occupancyCurrent: 44,
    occupancyForecast: 38,
    occupancyAverage: 61,
    trend: "decreasing",
    adr: 268,
    adrBaseline: 265,
    adrPosition: "at_market",
    pace: "slowing",
    vip: 0,
    returning: 3,
    narrative: ["Pickup has slowed and the forward window is running below the seasonal average."],
  }),
  forecasts: [
    forecast({
      key: "forecast.demand.soft.2026-09-01",
      kind: "demand",
      module: "booking",
      label: "Occupancy forecast",
      predictedValue: 38,
      lowerBound: 31,
      upperBound: 46,
      baselineValue: 61,
      direction: "down",
      severity: "high",
      confidence: 0.72,
      statement: "Occupancy is likely to land near 38%, 23 points below the seasonal average.",
      drivers: [{ label: "Booking pace", detail: "Pickup slowed for three consecutive weeks.", weight: -0.45 }],
    }),
  ],
};

const operationalPressure: SimulationScenario = {
  key: "operational_pressure",
  label: "Operational pressure",
  description: "An arrivals spike collides with limited housekeeping turnover capacity.",
  inputs: ["Arrivals spike on a single turnover day", "Housekeeping capacity constraint", "High forward occupancy"],
  expectations: [
    "An operational risk decision is produced",
    "Service reduction is penalised by the service-standard constraint",
    "The plan sequences capacity checks before any guest-facing change",
    "Every plan step names a responsible role",
  ],
  context: context({
    occupancyCurrent: 88,
    occupancyForecast: 93,
    occupancyAverage: 70,
    trend: "increasing",
    adr: 291,
    adrBaseline: 285,
    adrPosition: "at_market",
    pace: "accelerating",
    vip: 2,
    returning: 6,
    narrative: ["The house is close to full and turnover load is concentrated on one day."],
  }),
  forecasts: [
    forecast({
      key: "forecast.ops.2026-09-01",
      kind: "operational_risk",
      module: "operations",
      label: "Turnover load risk",
      predictedValue: 17,
      unit: " turnovers",
      direction: "up",
      severity: "high",
      confidence: 0.8,
      statement: "17 turnovers fall on a single day against a roster sized for 11.",
      drivers: [
        { label: "Arrivals spike", detail: "17 arrivals and 15 departures on the same date.", weight: 0.5 },
        { label: "Housekeeping capacity", detail: "Roster covers 11 turnovers inside the service window.", weight: -0.4 },
      ],
    }),
  ],
};

export const SIMULATION_SCENARIOS: SimulationScenario[] = [highDemand, lowDemand, operationalPressure];

export function scenarioByKey(key: ScenarioKey): SimulationScenario {
  const found = SIMULATION_SCENARIOS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown simulation scenario: ${key}`);
  return found;
}