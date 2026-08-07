import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, FlaskConical, Layers } from "lucide-react";
import { runSimulation } from "@/modules/intelligence/simulation/simulate";

export const Route = createFileRoute("/_authenticated/admin/intelligence/simulation")({
  head: () => ({
    meta: [
      { title: "Intelligence Simulation — Mtoni OS" },
      { name: "description", content: "End-to-end scenario simulation of the Mtoni Intelligence Core reasoning loop." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SimulationPage,
});

function SimulationPage() {
  const [nonce, setNonce] = useState(0);
  const report = useMemo(() => runSimulation(), []);
  void nonce;
  const [openKey, setOpenKey] = useState<string | null>(report.scenarios[0]?.key ?? null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Intelligence Simulation"
        description="Synthetic scenarios driven through the real reasoning path. Read-only — the simulation never writes to live intelligence data."
        actions={
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <FlaskConical className="mr-1.5 size-4" /> Re-run scenarios
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Scenarios" value={report.scenarios.length} icon={Layers} tone="info" />
        <StatCard label="Checks passed" value={report.passed} icon={CheckCircle2} tone="green" />
        <StatCard label="Checks failed" value={report.failed} icon={XCircle} tone={report.failed ? "danger" : "neutral"} />
        <StatCard
          label="Overall"
          value={report.status === "pass" ? "PASS" : "FAIL"}
          icon={FlaskConical}
          tone={report.status === "pass" ? "green" : "danger"}
        />
      </div>

      {report.scenarios.map((s) => (
        <SectionCard
          key={s.key}
          title={s.label}
          description={s.description}
          actions={
            <Badge variant={s.status === "pass" ? "default" : "destructive"}>
              {s.status === "pass" ? "Pass" : "Fail"}
            </Badge>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Inputs</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {s.inputs.map((i) => (
                    <li key={i}>• {i}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Expected</p>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {s.expectations.map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
              </div>
            </div>

            <ol className="grid gap-2 md:grid-cols-5">
              {s.stages.map((st) => (
                <li key={st.stage} className="rounded-lg border border-border/60 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{st.label}</p>
                  <p className="mt-1 text-sm text-foreground">{st.summary}</p>
                </li>
              ))}
            </ol>

            <div className="space-y-1.5">
              {s.checks.map((c) => (
                <div key={c.id} className="flex gap-2 rounded-md border border-border/50 p-2 text-sm">
                  {c.status === "pass" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[color:var(--os-green)]" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-[color:var(--os-danger)]" />
                  )}
                  <span className="text-foreground">
                    {c.label} <span className="text-muted-foreground">— {c.detail}</span>
                  </span>
                </div>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpenKey(openKey === s.key ? null : s.key)}
            >
              {openKey === s.key ? "Hide reasoning trace" : "Show reasoning trace"}
            </Button>

            {openKey === s.key && (
              <div className="space-y-3">
                {s.decisions.map((d) => (
                  <div key={d.key} className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm font-medium text-foreground">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.module} · {d.domain} · confidence {Math.round(d.confidence * 100)}% · risk {d.riskLevel} ·{" "}
                      {d.requiresApproval ? "approval required" : "no approval gate"}
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      Selected: {d.recommendedOptionTitle ?? "no acceptable option"}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.whySelected}</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {d.ranked.map((o) => (
                        <li key={o.key}>
                          {o.rank}. {o.title} — {Math.round(o.score * 100)}
                          {o.excluded ? ` (excluded: ${o.reason ?? "constraint"})` : ""}
                        </li>
                      ))}
                    </ul>
                    <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {d.planSteps.map((p) => (
                        <li key={p.sequence}>
                          {p.sequence}. {p.title} — {p.role}
                          {p.requiresApproval ? " (approval)" : ""}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}