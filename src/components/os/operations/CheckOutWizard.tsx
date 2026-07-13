import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { checkOutBooking } from "@/lib/operations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export function CheckOutWizard({ workspace }: { workspace: any }) {
  const b = workspace.booking;
  const [time, setTime] = useState(new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const nav = useNavigate();
  const fn = useServerFn(checkOutBooking);
  const m = useMutation({
    mutationFn: () => fn({ data: { bookingId: b.id, departureTime: time, notes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Guest checked out. Housekeeping task queued.");
      nav({ to: "/admin/operations/reservations/$id", params: { id: b.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6">
      <div className="space-y-2">
        <h3 className="font-semibold">Balance review</h3>
        {b.balance_amount > 0 ? (
          <div className="flex items-center gap-2 rounded bg-amber-500/10 p-3 text-sm text-amber-800">
            <AlertTriangle className="size-4" /> Outstanding balance: {b.currency} {b.balance_amount}
          </div>
        ) : (
          <p className="text-sm text-emerald-700">Fully paid ({b.currency} {b.total}).</p>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold">Extras</h3>
        {workspace.extras.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extras booked.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {workspace.extras.map((e: any) => (
              <li key={e.id} className="flex justify-between"><span>{e.extra?.name} × {e.quantity}</span><span className="tabular-nums">{b.currency} {Number(e.line_total).toFixed(2)}</span></li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Departure time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">
        Completing check-out will mark the stay complete, flip the room to “vacant dirty”, and queue a housekeeping task. Post-stay review requests will trigger via automation (future sprint).
      </p>
      <div className="flex justify-end">
        <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Checking out…" : "Complete check-out"}</Button>
      </div>
    </div>
  );
}