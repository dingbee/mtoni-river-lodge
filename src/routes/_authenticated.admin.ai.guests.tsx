import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Sparkles, Users } from "lucide-react";
import { listUpcomingArrivals } from "@/domains/ai/guest-intelligence.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/guests")({
  head: () => ({ meta: [{ title: "Guest Intelligence AI — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: GuestAiLayout,
});

function GuestAiLayout() {
  const matchRoute = useMatchRoute();
  const onChild = Boolean(
    matchRoute({ to: "/admin/ai/guests/dashboard" }) ||
    matchRoute({ to: "/admin/ai/guests/$bookingId" }),
  );
  if (onChild) return <Outlet />;
  return <ArrivalsList />;
}

function ArrivalsList() {
  const fn = useServerFn(listUpcomingArrivals);
  const q = useQuery({
    queryKey: ["ai.guest.arrivals"],
    queryFn: () => fn({ data: { days: 14 } }),
  });
  const rows = (q.data ?? []) as any[];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Guest Intelligence AI"
        description="AI-generated briefings, opportunities, health scores, and smart alerts for upcoming arrivals."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/ai/guests/dashboard"><LayoutDashboard className="mr-2 size-4" /> Daily Dashboard</Link>
          </Button>
        }
      />
      <SectionCard title="Upcoming arrivals (14 days)">
        {q.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading arrivals…</div>
        ) : q.isError ? (
          <div className="p-6 text-sm text-destructive">{(q.error as Error).message}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No confirmed arrivals in the next 14 days.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="p-2">Guest</th><th className="p-2">Check-in</th><th className="p-2">Nights</th><th className="p-2">Party</th><th className="p-2">Type</th><th className="p-2">Balance</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-muted/40">
                    <td className="p-2">
                      <div className="font-medium">{b.guest_name}</div>
                      <div className="text-xs text-muted-foreground">{b.reference} · {b.country ?? "—"}</div>
                    </td>
                    <td className="p-2">{b.check_in}</td>
                    <td className="p-2">{b.nights}</td>
                    <td className="p-2">{b.adults}A{b.children ? ` + ${b.children}C` : ""}</td>
                    <td className="p-2">{b.guest_type ? <Badge variant="secondary">{b.guest_type}</Badge> : "—"}</td>
                    <td className="p-2">{Number(b.balance_due ?? 0) > 0 ? <span className="text-destructive">{b.currency} {b.balance_due}</span> : <span className="text-muted-foreground">Paid</span>}</td>
                    <td className="p-2 text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/ai/guests/$bookingId" params={{ bookingId: b.id }}>
                          <Sparkles className="mr-1 size-3.5" /> Briefing
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      <SectionCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" /> {rows.length} arrival{rows.length === 1 ? "" : "s"} in scope
        </div>
      </SectionCard>
    </div>
  );
}