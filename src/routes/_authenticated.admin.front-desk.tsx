import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFrontDeskBookings } from "@/lib/front-desk.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, LogOut, ScanLine, Users, WalletCards } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/front-desk")({
  head: () => ({
    meta: [
      { title: "Front Desk — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: FrontDeskPage,
});

function FrontDeskPage() {
  const qc = useQueryClient();
  const fetchBookings = useServerFn(listFrontDeskBookings);
  const bookingsQ = useQuery({
    queryKey: ["fd-bookings"],
    queryFn: () => fetchBookings(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("front-desk")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        qc.invalidateQueries({ queryKey: ["fd-bookings"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const bookings = bookingsQ.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const arrivals = bookings.filter((b: any) => b.check_in === today && !["cancelled", "completed"].includes(b.status));
  const departures = bookings.filter((b: any) => b.check_out === today && b.status === "checked_in");
  const inHouse = bookings.filter((b: any) => b.status === "checked_in");
  const balances = bookings.filter((b: any) => Number(b.balance_amount) > 0 && !["cancelled", "completed"].includes(b.status));

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header>
        <h1 className="text-3xl font-serif">Front Desk</h1>
        <p className="text-sm text-muted-foreground">
          Today’s reception dashboard. Open the canonical Operations workflow for execution.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Today’s arrivals"
          value={arrivals.length}
          description="Guests due to arrive today"
          icon={<LogIn className="size-5" />}
          href="/admin/operations/arrivals"
        />
        <DashboardCard
          title="Today’s departures"
          value={departures.length}
          description="Guests currently checked in"
          icon={<LogOut className="size-5" />}
          href="/admin/operations"
        />
        <DashboardCard
          title="In-house guests"
          value={inHouse.length}
          description="Current checked-in guests"
          icon={<Users className="size-5" />}
          href="/admin/operations"
        />
        <DashboardCard
          title="Scan arrival pass"
          value="QR"
          description="Scan an approved guest pass"
          icon={<ScanLine className="size-5" />}
          href="/admin/operations/arrivals/scan"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardCard
          title="Pending balances"
          value={balances.length}
          description="Reservations with an outstanding balance"
          icon={<WalletCards className="size-5" />}
          href="/admin/bookings"
        />
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Operational handoff</p>
            <p className="mt-1 text-sm">Check-in and check-out are executed only from Operations.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/admin/operations">Open Operations</Link>
          </Button>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <p className="font-medium">Front Desk boundary</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Front Desk receives guests, scans arrival passes, and directs work. Reservations manages the booking;
          Operations performs the physical check-in, room state changes, housekeeping, tasks, alerts, and check-out.
        </p>
      </Card>
    </div>
  );
}

function DashboardCard({
  title,
  value,
  description,
  icon,
  href,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <Link to={href as any} className="block">
      <Card className="h-full p-5 transition hover:border-primary/40 hover:bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-md bg-muted p-2">{icon}</div>
        </div>
      </Card>
    </Link>
  );
}
