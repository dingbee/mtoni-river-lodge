import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listPreArrivalGuests } from "@/domains/ai/concierge/prearrival.functions";
import { generatePreArrivalRecommendations } from "@/domains/ai/concierge/proactive.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/pre-arrival")({
  head: () => ({
    meta: [{ title: "Pre-Arrival — AI Concierge" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: PreArrivalPage,
});

function PreArrivalPage() {
  const fn = useServerFn(listPreArrivalGuests);
  const genFn = useServerFn(generatePreArrivalRecommendations);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["prearrival"], queryFn: () => fn() });
  const generate = useMutation({
    mutationFn: () => genFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concierge.recs"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pre-Arrival Concierge"
        description="Upcoming arrivals with AI preparation suggestions. Suggestions only — nothing is sent automatically."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Generate recommendations"}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/admin/ai/concierge/recommendations">Review queue</Link>
            </Button>
          </div>
        }
      />
      <SectionCard title="Next 14 days">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming arrivals.</p>
        ) : (
          <div className="space-y-3">
            {(q.data as any[]).map((row) => (
              <div key={row.booking_id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{row.guest_name}</span>
                  <Badge variant="outline">{row.reference}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {row.check_in} → {row.check_out} · {row.adults}A/{row.children}C
                  </span>
                </div>
                {row.memories?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Approved memories: {row.memories.map((m: any) => m.memory_key).join(", ")}
                  </div>
                )}
                {row.suggestions?.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm space-y-0.5">
                    {row.suggestions.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No specific suggestions.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}