import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getTodaysArrivals } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/frontdesk")({
  component: FrontDeskAssistant,
});

function FrontDeskAssistant() {
  const fn = useServerFn(getTodaysArrivals);
  const q = useQuery({ queryKey: ["ops-arrivals-today"], queryFn: () => fn({ data: undefined as any }) });

  return (
    <div className="space-y-6">
      <PageHeader title="Front Desk AI Assistant" description="Today's arrivals with AI preparation notes." />
      <SectionCard title={`Arrivals today (${q.data?.length ?? 0})`}>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((b: any) => {
              const notes: string[] = [];
              if (b.guest_type && b.guest_type !== "standard") notes.push(`Priority: ${b.guest_type}`);
              if ((b.children ?? 0) > 0) notes.push("Family — extra towels & family activity guide");
              if (b.special_requests) notes.push(`Note: ${b.special_requests}`);
              if (b.visit_purpose && /kilimanjaro|trek|climb/i.test(b.visit_purpose))
                notes.push("Kilimanjaro guest — early breakfast & trek logistics");
              return (
                <li key={b.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{b.guest_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.reference} · {b.adults}A{b.children ? ` + ${b.children}C` : ""} · {b.check_in} → {b.check_out}
                      </div>
                    </div>
                    {b.guest_type && b.guest_type !== "standard" && (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs uppercase text-primary">
                        {b.guest_type}
                      </span>
                    )}
                  </div>
                  {notes.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {notes.map((n, i) => (
                        <li key={i}>• {n}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No arrivals scheduled today.</p>
        )}
      </SectionCard>
    </div>
  );
}