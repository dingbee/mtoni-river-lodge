import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReservationWorkspace } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { RoomStateChip } from "@/components/os/operations/RoomStateChip";
import { User, DollarSign, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/operations/reservations/$id")({
  head: () => ({ meta: [{ title: "Reservation Workspace — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ReservationWorkspace,
});

function ReservationWorkspace() {
  const { id } = Route.useParams();
  const fn = useServerFn(getReservationWorkspace);
  const q = useQuery({ queryKey: ["ops-reservation", id], queryFn: () => fn({ data: { id } }), staleTime: 30_000 });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const d: any = q.data!;
  const b = d.booking;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${b.guest_name} · ${b.reference}`}
        description={`${b.check_in} → ${b.check_out} · ${b.nights} nights · ${b.room?.name}`}
      />

      <div className="flex flex-wrap gap-2">
        {b.status !== "checked_in" && b.status !== "completed" && b.status !== "cancelled" && (
          <Button asChild size="sm"><Link to="/admin/operations/checkin/$id" params={{ id: b.id }}>Check in</Link></Button>
        )}
        {b.status === "checked_in" && (
          <Button asChild size="sm"><Link to="/admin/operations/checkout/$id" params={{ id: b.id }}>Check out</Link></Button>
        )}
        {b.guest_id && (
          <Button asChild size="sm" variant="outline"><Link to="/admin/guests/crm/$id" params={{ id: b.guest_id }}>Guest profile</Link></Button>
        )}
        <Button asChild size="sm" variant="outline"><Link to="/admin/bookings">All reservations</Link></Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Guest" description="Intelligence from CRM">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd>{b.guest_email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd>{b.guest_phone ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Country</dt><dd>{b.country ?? "—"}</dd></div>
            {b.guest && (<>
              <div className="flex justify-between"><dt className="text-muted-foreground">Total stays</dt><dd>{b.guest.total_stays ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Lifetime spend</dt><dd className="tabular-nums">${Number(b.guest.lifetime_spend ?? 0).toFixed(0)}</dd></div>
            </>)}
          </dl>
          {b.guest?.ai_summary && <p className="mt-3 rounded bg-muted/40 p-2 text-xs">{b.guest.ai_summary}</p>}
          {b.special_requests && (
            <div className="mt-3">
              <div className="text-xs font-medium">Special requests</div>
              <p className="text-xs text-muted-foreground">{b.special_requests}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Payment progress" description={`${b.currency} ${b.total}`}>
          <div className="space-y-2 text-sm">
            <Row label="Deposit" value={`${b.currency} ${b.deposit_amount}`} />
            <Row label="Balance" value={`${b.currency} ${b.balance_amount}`} tone={b.balance_amount > 0 ? "warn" : "success"} />
            <Row label="Status" value={b.payment_status} />
          </div>
          <h4 className="mt-4 flex items-center gap-1 text-xs font-medium text-muted-foreground"><DollarSign className="size-3" /> Recent events</h4>
          {(!d.payments || d.payments.length === 0) ? (
            <p className="text-xs text-muted-foreground">No payment events.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-xs">
              {d.payments.slice(0, 5).map((p: any) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.event_type ?? p.type ?? "event"}</span>
                  <span className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Experiences & extras">
          {d.extras.length === 0 ? (
            <p className="text-sm text-muted-foreground">No extras booked.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.extras.map((e: any) => (
                <li key={e.id} className="flex justify-between"><span>{e.extra?.name} × {e.quantity}</span><span className="tabular-nums">{b.currency} {Number(e.line_total).toFixed(2)}</span></li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Tasks" description="Reservation-linked ops tasks">
          {d.tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks yet.</p> : (
            <ul className="divide-y">
              {d.tasks.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <span><ListChecks className="mr-1 inline size-3" />{t.title}</span>
                  <span className="text-xs text-muted-foreground">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Room assignments" description="Physical units for this room type">
          {d.roomStates.length === 0 ? <p className="text-sm text-muted-foreground">No units configured.</p> : (
            <ul className="divide-y">
              {d.roomStates.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span><User className="mr-1 inline size-3" />{r.unit_label}</span>
                  <RoomStateChip state={r.state} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: any; tone?: "warn" | "success" }) {
  const cls = tone === "warn" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : "";
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${cls}`}>{value}</span>
    </div>
  );
}