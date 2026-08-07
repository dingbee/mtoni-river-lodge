import { describe, expect, it } from "vitest";
import { runSimulation, runScenario } from "../simulate";
import { scenarioByKey, SIMULATION_SCENARIOS } from "../scenarios";

describe("end-to-end intelligence simulation", () => {
  it("passes every governance and quality check across all scenarios", () => {
    const report = runSimulation();
    const failures = report.scenarios.flatMap((s) =>
      s.checks.filter((c) => c.status === "fail").map((c) => `${s.key}: ${c.label} — ${c.detail}`),
    );
    expect(failures).toEqual([]);
    expect(report.status).toBe("pass");
  });

  it("is deterministic — identical inputs produce identical decisions", () => {
    const a = runScenario(scenarioByKey("high_demand"));
    const b = runScenario(scenarioByKey("high_demand"));
    expect(JSON.stringify(a.decisions)).toBe(JSON.stringify(b.decisions));
  });

  it("runs the full predict → decide → plan → approve → outcome loop", () => {
    for (const scenario of SIMULATION_SCENARIOS) {
      const result = runScenario(scenario);
      expect(result.stages.map((s) => s.stage)).toEqual(["predict", "decide", "plan", "approve", "outcome"]);
    }
  });

  it("high demand recommends a rate/value lever, never a broad discount", () => {
    const r = runScenario(scenarioByKey("high_demand"));
    const revenue = r.decisions.find((d) => d.domain === "revenue");
    expect(revenue?.recommendedOptionKey).not.toBe("broad_discount");
    expect(revenue?.excludedKeys).toContain("broad_discount");
    expect(revenue?.requiresApproval).toBe(true);
  });

  it("low demand produces no discount recommendation when strategic memory prohibits it", () => {
    const r = runScenario(scenarioByKey("low_demand"));
    const soft = r.decisions.find((d) => d.domain === "demand" || d.domain === "revenue");
    expect(soft?.excludedKeys).toContain("broad_discount");
    expect(soft?.recommendedOptionKey).not.toBe("broad_discount");
    expect(soft?.constraintKeys).toContain("strategic.no_broad_discounting");
  });

  it("operational pressure produces an operations plan that protects service", () => {
    const r = runScenario(scenarioByKey("operational_pressure"));
    const ops = r.decisions.find((d) => d.domain === "operations");
    expect(ops).toBeTruthy();
    expect(ops?.recommendedOptionKey).not.toBe("reduce_service");
    expect(ops!.planSteps.length).toBeGreaterThan(2);
  });

  it("never recommends an option that was excluded by a constraint", () => {
    for (const s of runSimulation().scenarios) {
      for (const d of s.decisions) {
        expect(d.excludedKeys).not.toContain(d.recommendedOptionKey);
      }
    }
  });
});