import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function RecommendationCard({
  rec,
  onAction,
}: {
  rec: any;
  onAction: (id: string, a: "accept" | "dismiss" | "convert") => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{rec.title}</h3>
            {rec.kind && <Badge variant="outline">{rec.kind}</Badge>}
            {rec.action && <Badge variant="outline">{rec.action}</Badge>}
            <Badge variant={rec.status === "pending" ? "secondary" : "outline"}>{rec.status}</Badge>
            <Badge variant="outline">confidence {Math.round(Number(rec.confidence ?? 0) * 100)}%</Badge>
            {typeof rec.impact_score === "number" && <Badge variant="outline">impact {rec.impact_score}</Badge>}
          </div>
          {(rec.target_route || rec.target_label) && (
            <p className="mt-1 text-xs text-muted-foreground">{rec.target_route ?? rec.target_label}</p>
          )}
          <p className="mt-2 text-sm">{rec.reasoning}</p>
          {rec.expected_impact && (
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Expected impact:</strong> {rec.expected_impact}
            </p>
          )}
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Evidence &amp; suggested payload</summary>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2 text-[11px]">
{JSON.stringify({ evidence: rec.evidence, suggested_payload: rec.suggested_payload }, null, 2)}
            </pre>
          </details>
        </div>
        {rec.status === "pending" && (
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => onAction(rec.id, "dismiss")}>Dismiss</Button>
            <Button size="sm" variant="outline" onClick={() => onAction(rec.id, "convert")}>Task</Button>
            <Button size="sm" onClick={() => onAction(rec.id, "accept")}>Accept</Button>
          </div>
        )}
      </div>
    </div>
  );
}