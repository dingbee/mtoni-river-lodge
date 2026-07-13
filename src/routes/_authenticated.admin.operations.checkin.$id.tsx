import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReservationWorkspace } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { CheckInWizard } from "@/components/os/operations/CheckInWizard";

export const Route = createFileRoute("/_authenticated/admin/operations/checkin/$id")({
  head: () => ({ meta: [{ title: "Check-in — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CheckInPage,
});

function CheckInPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getReservationWorkspace);
  const q = useQuery({ queryKey: ["ops-reservation", id], queryFn: () => fn({ data: { id } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !q.data) return <p className="text-sm text-rose-600">{(q.error as Error)?.message ?? "Not found"}</p>;
  return (
    <div className="space-y-4">
      <PageHeader title="Guided check-in" description="Six-step flow before handing over the keys." />
      <CheckInWizard workspace={q.data} />
    </div>
  );
}