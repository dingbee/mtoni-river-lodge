/**
 * Sprint 7 — End-to-end intelligence simulation runner.
 *
 * Drives the real reasoning path (context → prediction → decision → plan →
 * approval → expected outcome) against synthetic scenarios and asserts the
 * governance and quality expectations of each one.
 *
 * Pure and read-only: no Supabase, no AI, no writes. Same inputs → same report.
 */
import { buildDecisions } from "../decisions/decisionEngine";
import type { Decision, EvaluatedOption } from "../decisions/decision.types";
import { deriveExpectedMetrics } from "../orchestration/expectedMetrics";
import type { ExpectedMetric } from "../orchestration/orchestration.types";
import { SIMULATION_SCENARIOS, type SimulationScenario, type ScenarioKey } from "./scenarios";

export type CheckStatus = "pass" | "fail";

export interface SimulationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface SimulationStage {
  stage: "predict" | "decide" | "plan" | "approve" | "outcome";
  label: string;
  summary: string;
  detail: string[];
}

export interface SimulatedDecision {
  key: string;
  module: string;
  domain: string;
  title: string;
  riskLevel: Decision["riskLevel"];
  confidence: number;
  requiresApproval: boolean;
  recommendedOptionKey: string | null;
  recommendedOptionTitle: string | null;
  whySelected: string;
  ranked: Array<{ rank: number; key: string; title: string; score: number; excluded: boolean; reason: string | null }>;
  excludedKeys: string[];
  constraintKeys: string[];
  planSteps: Array<{ sequence: number; title: string; role: string; requiresApproval: boolean }>;
  expectedMetrics: ExpectedMetric[];
}

export interface ScenarioResult {
  key: ScenarioKey;
  label: string;
  description: string;
  inputs: string[];
  expectations: string[];
  status: CheckStatus;
  stages: SimulationStage[];
  decisions: SimulatedDecision[];
  checks: SimulationCheck[];
}

export interface SimulationReport {
  generated_at: string;
  status: CheckStatus;
  passed: number;
  failed: number;
  scenarios: ScenarioResult[];
}

const pctOf = (n: number) => Math.round(n * 100);

function toSimulated(d: Decision, scenario: SimulationScenario): SimulatedDecision {
  const top = d.options.find((o) => o.option.key === d.recommendedOptionKey) ?? null;
  return {
    key: d.key,
    module: d.module,
    domain: d.domain,
    title: d.title,
    riskLevel: d.riskLevel,
    confidence: d.confidence,
    requiresApproval: d.requiresApproval,
    recommendedOptionKey: d.recommendedOptionKey,
    recommendedOptionTitle: top?.option.title ?? null,
    whySelected: d.reasoning.whySelected,
    ranked: d.options.map((o: EvaluatedOption) => ({
      rank: o.rank,
      key: o.option.key,
      title: o.option.title,
      score: o.finalScore,
      excluded: o.excluded,
      reason: o.exclusionReason,
    })),
    excludedKeys: d.options.filter((o) => o.excluded).map((o) => o.option.key),
    constraintKeys: d.constraints.map((c) => c.key),
    planSteps: d.plan.steps.map((s) => ({
      sequence: s.sequence,
      title: s.title,
      role: s.responsibleRole,
      requiresApproval: s.requiresApproval,
    })),
    expectedMetrics: deriveExpectedMetrics(d.domain, scenario.context),
  };
}

function check(id: string, label: string, ok: boolean, detail: string): SimulationCheck {
  return { id, label, status: ok ? "pass" : "fail", detail };
}

function commonChecks(scenario: SimulationScenario, decisions: SimulatedDecision[]): SimulationCheck[] {
  const withPlans = decisions.filter((d) => d.planSteps.length > 0);
  const rolesNamed = decisions.every((d) => d.planSteps.every((s) => s.role.length > 0));
  const traceable = decisions.every((d) => d.whySelected.length > 0 && d.ranked.length > 1);
  return [
    check(
      "produced",
      "The scenario produces at least one decision",
      decisions.length > 0,
      `${decisions.length} decision(s) evaluated from ${scenario.forecasts.length} prediction(s).`,
    ),
    check(
      "planned",
      "Every decision carries an executable plan",
      decisions.length > 0 && withPlans.length === decisions.length,
      `${withPlans.length}/${decisions.length} decisions produced ordered plan steps.`,
    ),
    check("roles", "Every plan step names a responsible role", rolesNamed, "Plan steps carry an accountable role."),
    check(
      "traceable",
      "Every decision explains the ranking against alternatives",
      traceable,
      "Each decision records the full ranked option set and the reason the winner was chosen.",
    ),
    check(
      "measurable",
      "Every decision defines expected outcome metrics",
      decisions.length > 0 && decisions.every((d) => d.expectedMetrics.length > 0),
      "Expected metrics are derived before execution so outcomes can be scored later.",
    ),
  ];
}

function scenarioChecks(scenario: SimulationScenario, decisions: SimulatedDecision[]): SimulationCheck[] {
  const checks = commonChecks(scenario, decisions);
  const revenue = decisions.find((d) => d.domain === "revenue");
  const demand = decisions.find((d) => d.domain === "demand");
  const guest = decisions.find((d) => d.domain === "guest_experience");
  const ops = decisions.find((d) => d.domain === "operations");

  if (scenario.key === "high_demand") {
    checks.push(
      check("revenue_decision", "A revenue decision responds to rising demand", !!revenue, revenue?.title ?? "missing"),
      check(
        "no_discount",
        "Broad discounting is excluded under premium positioning",
        !!revenue?.excludedKeys.includes("broad_discount"),
        revenue?.ranked.find((o) => o.key === "broad_discount")?.reason ?? "no discount option present",
      ),
      check(
        "approval_required",
        "The revenue decision requires management approval",
        revenue?.requiresApproval === true,
        "Revenue-impacting decisions never auto-execute.",
      ),
      check(
        "vip_prepared",
        "Returning VIP guests trigger a guest-experience decision",
        !!guest,
        guest?.recommendedOptionTitle ?? "missing",
      ),
    );
  }

  if (scenario.key === "low_demand") {
    const soft = demand ?? revenue;
    checks.push(
      check("soft_decision", "A demand decision responds to the soft window", !!soft, soft?.title ?? "missing"),
      check(
        "discount_excluded",
        "No discount is recommended while strategic memory prohibits it",
        !!soft && soft.recommendedOptionKey !== "broad_discount" && soft.excludedKeys.includes("broad_discount"),
        soft?.ranked.find((o) => o.key === "broad_discount")?.reason ?? "no discount option present",
      ),
      check(
        "memory_constraint",
        "The exclusion is attributed to strategic memory",
        !!soft?.constraintKeys.includes("strategic.no_broad_discounting"),
        (soft?.constraintKeys ?? []).join(", "),
      ),
      check(
        "rate_integrity",
        "The recommended option preserves rate integrity",
        !!soft?.recommendedOptionKey && !["broad_discount"].includes(soft.recommendedOptionKey),
        soft?.recommendedOptionTitle ?? "no acceptable option",
      ),
    );
  }

  if (scenario.key === "operational_pressure") {
    const reduce = ops?.ranked.find((o) => o.key === "reduce_service");
    checks.push(
      check("risk_decision", "The risk prediction produces an operational decision", !!ops, ops?.title ?? "missing"),
      check(
        "service_protected",
        "Cutting guest service is not the recommended response",
        !!ops && ops.recommendedOptionKey !== "reduce_service",
        ops?.recommendedOptionTitle ?? "no acceptable option",
      ),
      check(
        "service_penalised",
        "Service reduction ranks below protected options",
        !!reduce && reduce.rank > 1,
        reduce ? `Service reduction ranked #${reduce.rank}.` : "option absent",
      ),
      check(
        "capacity_first",
        "The plan verifies capacity before any guest-facing change",
        !!ops && ops.planSteps.some((s) => /capacity/i.test(s.title) && s.sequence <= 2),
        ops?.planSteps.map((s) => s.title).join(" → ") ?? "no plan",
      ),
    );
  }

  return checks;
}

function stagesFor(scenario: SimulationScenario, decisions: SimulatedDecision[]): SimulationStage[] {
  const lead = decisions[0];
  return [
    {
      stage: "predict",
      label: "Predict",
      summary: `${scenario.forecasts.length} prediction(s) from the business context.`,
      detail: scenario.forecasts.map((f) => `${f.label}: ${f.statement} (${pctOf(f.confidence)}% confidence)`),
    },
    {
      stage: "decide",
      label: "Decide",
      summary: lead ? `${lead.title} → ${lead.recommendedOptionTitle ?? "no acceptable option"}` : "No decision produced.",
      detail: decisions.map(
        (d) =>
          `${d.title} — ${d.recommendedOptionTitle ?? "none"} (${pctOf(d.confidence)}% confidence, risk ${d.riskLevel}, ${d.excludedKeys.length} option(s) excluded)`,
      ),
    },
    {
      stage: "plan",
      label: "Plan",
      summary: `${decisions.reduce((n, d) => n + d.planSteps.length, 0)} plan step(s) sequenced.`,
      detail: lead ? lead.planSteps.map((s) => `${s.sequence}. ${s.title} — ${s.role}`) : [],
    },
    {
      stage: "approve",
      label: "Approve",
      summary: `${decisions.filter((d) => d.requiresApproval).length}/${decisions.length} decisions held for management approval.`,
      detail: decisions.map((d) => `${d.title}: ${d.requiresApproval ? "approval required" : "no approval gate"}`),
    },
    {
      stage: "outcome",
      label: "Outcome",
      summary: `${decisions.reduce((n, d) => n + d.expectedMetrics.length, 0)} expected metric(s) captured for later verification.`,
      detail: lead
        ? lead.expectedMetrics.map((m) => `${m.label}: target ${m.targetValue}${m.unit} (${m.comparator})`)
        : [],
    },
  ];
}

/** Run a single scenario through the real reasoning path. */
export function runScenario(scenario: SimulationScenario): ScenarioResult {
  const decisions = buildDecisions(scenario.context, scenario.forecasts).map((d) => toSimulated(d, scenario));
  const checks = scenarioChecks(scenario, decisions);
  return {
    key: scenario.key,
    label: scenario.label,
    description: scenario.description,
    inputs: scenario.inputs,
    expectations: scenario.expectations,
    status: checks.every((c) => c.status === "pass") ? "pass" : "fail",
    stages: stagesFor(scenario, decisions),
    decisions,
    checks,
  };
}

/** Run every scenario and summarise. Read-only — safe to call from the UI. */
export function runSimulation(scenarios: SimulationScenario[] = SIMULATION_SCENARIOS): SimulationReport {
  const results = scenarios.map(runScenario);
  const all = results.flatMap((r) => r.checks);
  return {
    generated_at: new Date().toISOString(),
    status: results.every((r) => r.status === "pass") ? "pass" : "fail",
    passed: all.filter((c) => c.status === "pass").length,
    failed: all.filter((c) => c.status === "fail").length,
    scenarios: results,
  };
}