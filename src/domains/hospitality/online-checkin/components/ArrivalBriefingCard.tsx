import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionCard } from "@/components/os/SectionCard";
import { StatusChip } from "@/components/os/StatusChip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getArrivalBriefing } from "../services/arrival-intelligence.functions";
import type { ArrivalBriefing } from "../services/arrival-intelligence-shared";

export function ArrivalBriefingCard({ bookingId }: { bookingId: string }) {
  const fn = useServerFn(getArrivalBriefing);
  const query = useQuery({
    queryKey: ["arrival-briefing", bookingId],
    queryFn: () => fn({ data: { bookingId, refresh: false } }) as Promise<ArrivalBriefing>,
    staleTime: 5 * 60_000,
  });
  const briefing = query.data;

  return (
    <SectionCard
      title="AI arrival briefing"
      description="Advisory only — generated from reservation, guest and arrival data. Never shared with the guest."
      actions={
        <Button
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => {
            void fn({ data: { bookingId, refresh: true } }).then(() => query.refetch());
          }}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
      }
    >
      {query.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          {(query.error as Error)?.message ?? "Briefing unavailable."}
        </p>
      ) : !briefing ? (
        <p className="text-sm text-muted-foreground">No briefing available.</p>
      ) : (
        <div className="space-y-3">
          <p className="flex gap-2 text-sm leading-relaxed text-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--os-accent,inherit)]" />
            <span>{briefing.summary}</span>
          </p>
          {briefing.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {briefing.highlights.map((h) => (
                <StatusChip key={h} tone="info">
                  {h}
                </StatusChip>
              ))}
            </div>
          )}
          {briefing.attention.length > 0 && (
            <ul className="space-y-1 text-sm">
              {briefing.attention.map((a) => (
                <li key={a} className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--os-warn)]" />
                  {a}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {briefing.source === "fallback"
              ? "Generated from Mtoni OS data (AI unavailable)."
              : `Mtoni AI · ${briefing.model ?? "model"}`}{" "}
            · {new Date(briefing.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
