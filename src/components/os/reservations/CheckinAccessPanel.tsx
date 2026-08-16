import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getReservationCheckinAccess,
  ensureReservationCheckin,
} from "@/lib/staff-reservations.functions";

/** Shows the existing MOCI (online check-in) status/link for a reservation. */
export function CheckinAccessPanel({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const accessFn = useServerFn(getReservationCheckinAccess);
  const ensureFn = useServerFn(ensureReservationCheckin);

  const access = useQuery({
    queryKey: ["reservation-checkin", bookingId],
    queryFn: () => accessFn({ data: { bookingId } }),
  });

  const ensure = useMutation({
    mutationFn: () => ensureFn({ data: { bookingId } }),
    onSuccess: () => {
      toast.success("Online check-in prepared");
      qc.invalidateQueries({ queryKey: ["reservation-checkin", bookingId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = access.data?.token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/check-in/${access.data.token}`
    : null;

  return (
    <div className="mt-5 rounded-lg border border-border p-4 text-sm">
      <p className="text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground">
        Online check-in
      </p>
      {access.isLoading ? (
        <p className="mt-2 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking…
        </p>
      ) : access.error ? (
        <p className="mt-2 text-destructive">{(access.error as Error).message}</p>
      ) : link ? (
        <div className="mt-2 space-y-2">
          <p className="text-muted-foreground">Status: {access.data?.status}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs">
              {link}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Check-in link copied");
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
      ) : access.data?.eligible ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Eligible — no check-in record yet.</span>
          <Button size="sm" onClick={() => ensure.mutate()} disabled={ensure.isPending}>
            {ensure.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Prepare check-in
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">
          Not eligible for online check-in{access.data?.reason ? ` — ${access.data.reason}` : ""}.
        </p>
      )}
    </div>
  );
}
