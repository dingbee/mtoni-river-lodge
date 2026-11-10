import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dispatchGuestRequest } from "./guest-request-dispatch.functions";
import { listGuestRequests } from "./guest-requests.functions";
import { updateGuestRequestStatus } from "./guest-request-execution.functions";
import { guestRequestStatusLabel } from "@/domains/hospitality/guest-portal/guest-portal.shared";

const CATEGORY_LABELS: Record<string, string> = {
  housekeeping: "Housekeeping",
  room_service: "Room service",
  dining: "Dining",
  airport_transfer: "Transport",
  maintenance: "Maintenance",
  special_occasion: "Special occasion",
  private_dining: "Private dining",
  complaint: "Complaint",
  service_recovery: "Service recovery",
  other: "Other",
};

export function GuestRequestsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGuestRequests);
  const dispatchFn = useServerFn(dispatchGuestRequest);
  const statusFn = useServerFn(updateGuestRequestStatus);

  const requests = useQuery({
    queryKey: ["sn-iq-05-guest-requests"],
    queryFn: () => listFn({ data: { status: "all", limit: 50 } }),
    refetchInterval: 15000,
  });

  const dispatch = useMutation({
    mutationFn: (requestId: string) => dispatchFn({ data: { request_id: requestId } }),
    onSuccess: (result) => {
      toast.success(
        result.task_category === "housekeeping"
          ? "Request dispatched through HK-X"
          : "Request dispatched to operations",
      );
      qc.invalidateQueries({ queryKey: ["sn-iq-05-guest-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: (input: { requestId: string; status: "triaged" | "cancelled" | "escalated" }) =>
      statusFn({ data: { request_id: input.requestId, status: input.status } }),
    onSuccess: () => {
      toast.success("Guest request updated");
      qc.invalidateQueries({ queryKey: ["sn-iq-05-guest-requests"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="font-display text-xl">Guest Requests</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            SN-IQ-05 operational intake · active property only
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void requests.refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {requests.isLoading && (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
        </div>
      )}
      {requests.error && (
        <p className="p-4 text-sm text-destructive">{(requests.error as Error).message}</p>
      )}
      {requests.data?.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          No guest requests have been received for this property.
        </p>
      )}

      <div className="divide-y divide-border">
        {requests.data?.map((request) => (
          <article key={request.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {CATEGORY_LABELS[request.category] ?? request.category}
                  </span>
                  <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium">
                    {guestRequestStatusLabel(request.status)}
                  </span>
                  {request.priority === 1 && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                      Urgent
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{request.request_text}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {request.guest_name ?? "Guest"} ·{" "}
                  {request.booking_id ? "Booking linked" : "No booking"} ·{" "}
                  {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                </p>
              </div>
              <p className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {request.id.slice(0, 8).toUpperCase()}
              </p>
            </div>

            {request.status_note && (
              <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                {request.status_note}
              </p>
            )}
            {request.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Guest photographic evidence">
                {request.attachments.map((photo, index: number) => (
                  <a
                    key={index}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={photo.url}
                      alt={photo.fileName ?? "Guest photographic evidence"}
                      className="h-20 w-20 rounded-md border border-border object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            {request.operational_task_id && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Linked task: {request.operational_task_id}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {!request.operational_task_id &&
                !["fulfilled", "cancelled"].includes(request.status) && (
                  <Button
                    size="sm"
                    onClick={() => dispatch.mutate(request.id)}
                    disabled={dispatch.isPending || updateStatus.isPending}
                  >
                    {dispatch.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {request.category === "housekeeping"
                      ? "Dispatch through HK-X"
                      : "Dispatch to department"}
                  </Button>
                )}
              {request.status === "received" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateStatus.mutate({ requestId: request.id, status: "triaged" })}
                  disabled={updateStatus.isPending}
                >
                  Confirm receipt
                </Button>
              )}
              {!["fulfilled", "cancelled", "escalated"].includes(request.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateStatus.mutate({ requestId: request.id, status: "escalated" })
                  }
                  disabled={updateStatus.isPending}
                >
                  <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Escalate
                </Button>
              )}
              {!["fulfilled", "cancelled"].includes(request.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateStatus.mutate({ requestId: request.id, status: "cancelled" })
                  }
                  disabled={updateStatus.isPending}
                >
                  Cancel
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
