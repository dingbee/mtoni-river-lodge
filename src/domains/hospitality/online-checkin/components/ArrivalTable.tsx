import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { StatusChip } from "@/components/os/StatusChip";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import {
  ARRIVAL_ALERT_LABEL,
  ARRIVAL_READINESS_LABEL,
  arrivalReadinessTone,
  CHECKIN_STATUS_FILTER_LABEL,
  DOCUMENT_STATUS_LABEL,
  checkinStatusTone,
  documentStatusTone,
  roomReadinessLabel,
  roomReadinessTone,
  type ArrivalListItem,
} from "../services/arrivals-shared";

function relative(ts: string | null) {
  if (!ts) return "—";
  const diff = Date.now() - Date.parse(ts);
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function ArrivalTable({ items }: { items: ArrivalListItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="No arrivals match these filters"
        description="Adjust the date range, status or search to see more reservations."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Guest</th>
            <th className="py-2 pr-3 font-medium">Readiness</th>
            <th className="py-2 pr-3 font-medium">Stay</th>
            <th className="py-2 pr-3 font-medium">Room / unit</th>
            <th className="py-2 pr-3 font-medium">Check-in</th>
            <th className="py-2 pr-3 font-medium">Documents</th>
            <th className="py-2 pr-3 font-medium">Reservation</th>
            <th className="py-2 pr-3 font-medium">Room ready</th>
            <th className="py-2 pr-3 font-medium">Last activity</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((a) => (
            <tr key={a.bookingId} className="align-top">
              <td className="py-3 pr-3">
                <Link
                  to="/admin/operations/arrivals/$id"
                  params={{ id: a.bookingId }}
                  className="font-medium hover:underline"
                >
                  {a.guestName}
                </Link>
                <div className="text-xs text-muted-foreground">{a.reference}</div>
                {a.guestType === "vip" && (
                  <StatusChip tone="warning" className="mt-1">
                    VIP
                  </StatusChip>
                )}
                {a.specialRequests && (
                  <div
                    className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground"
                    title={a.specialRequests}
                  >
                    “{a.specialRequests}”
                  </div>
                )}
              </td>
              <td className="py-3 pr-3">
                <StatusChip tone={arrivalReadinessTone(a.readiness)}>
                  {ARRIVAL_READINESS_LABEL[a.readiness]}
                </StatusChip>
                {a.outstandingActions.length > 0 && (
                  <ul className="mt-1 max-w-[200px] space-y-0.5 text-[0.65rem] text-muted-foreground">
                    {a.outstandingActions.slice(0, 3).map((action) => (
                      <li key={action}>• {action}</li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-3 pr-3 text-xs text-muted-foreground">
                <div className="text-foreground">{a.checkIn}</div>
                <div>
                  → {a.checkOut} · {a.nights}n
                </div>
                {a.estimatedArrivalTime && <div>ETA {a.estimatedArrivalTime}</div>}
              </td>
              <td className="py-3 pr-3 text-xs">
                <div className="text-foreground">{a.roomName}</div>
                <div className="text-muted-foreground">{a.unitLabel ?? "Unassigned"}</div>
              </td>
              <td className="py-3 pr-3">
                <StatusChip tone={checkinStatusTone(a.checkinStatus)}>
                  {CHECKIN_STATUS_FILTER_LABEL[a.checkinStatus]}
                </StatusChip>
              </td>
              <td className="py-3 pr-3">
                <StatusChip tone={documentStatusTone(a.documentStatus)}>
                  {DOCUMENT_STATUS_LABEL[a.documentStatus]}
                </StatusChip>
                <div className="mt-1 text-xs text-muted-foreground">
                  {a.documentCounts.total} uploaded · {a.documentCounts.verified} verified
                </div>
              </td>
              <td className="py-3 pr-3 text-xs">
                <div className="capitalize text-foreground">
                  {a.reservationStatus.replace("_", " ")}
                </div>
                <div className="capitalize text-muted-foreground">
                  {a.paymentStatus.replace("_", " ")}
                </div>
              </td>
              <td className="py-3 pr-3">
                <StatusChip tone={roomReadinessTone(a.roomReadiness)}>
                  {roomReadinessLabel(a.roomReadiness)}
                </StatusChip>
                {a.alerts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.alerts.map((al) => (
                      <span
                        key={al.kind}
                        title={al.message}
                        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground"
                      >
                        <AlertTriangle className="h-3 w-3" /> {ARRIVAL_ALERT_LABEL[al.kind]}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-3 pr-3 text-xs text-muted-foreground">
                {relative(a.lastActivityAt)}
              </td>
              <td className="py-3">
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/operations/arrivals/$id" params={{ id: a.bookingId }}>
                    Open
                  </Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
