import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { checkInBooking } from "@/lib/operations.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Circle, Copy, Download } from "lucide-react";
import { buildGuestPortalUrl } from "@/domains/hospitality/guest-portal/guest-portal.shared";

type Step = "verify" | "guest" | "payment" | "assign" | "notes" | "confirm" | "portal";
const STEPS: { id: Step; label: string }[] = [
  { id: "verify", label: "Verify reservation" },
  { id: "guest", label: "Verify guest" },
  { id: "payment", label: "Payment status" },
  { id: "assign", label: "Assign room" },
  { id: "notes", label: "Operational notes" },
  { id: "confirm", label: "Complete check-in" },
  { id: "portal", label: "Guest Portal access" },
];

export function CheckInWizard({ workspace }: { workspace: any }) {
  const [step, setStep] = useState<Step>("verify");
  const [arrivalTime, setArrivalTime] = useState(new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [guestPortalLink, setGuestPortalLink] = useState<string | null>(null);
  const [guestPortalQr, setGuestPortalQr] = useState<string | null>(null);
  const [roomStateId, setRoomStateId] = useState<string | undefined>(
    workspace.roomStates?.find((r: any) => r.state === "vacant_clean")?.id,
  );
  const nav = useNavigate();
  const fn = useServerFn(checkInBooking);
  const m = useMutation({
    mutationFn: () => fn({ data: { bookingId: workspace.booking.id, roomStateId, arrivalTime, notes: notes || undefined } }),
    onSuccess: (result) => {
      toast.success("Check-in complete");
      const token = result?.guestPortalAccess?.token;
      if (token) setGuestPortalLink(buildGuestPortalUrl(window.location.origin, token));
      setStep("portal");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    let cancelled = false;
    if (!guestPortalLink) {
      setGuestPortalQr(null);
      return;
    }
    QRCode.toDataURL(guestPortalLink, { errorCorrectionLevel: "H", margin: 4, width: 1200 })
      .then((dataUrl) => { if (!cancelled) setGuestPortalQr(dataUrl); })
      .catch(() => { if (!cancelled) toast.error("Guest Portal QR generation failed. The secure link is still available."); });
    return () => { cancelled = true; };
  }, [guestPortalLink]);

  const idx = STEPS.findIndex((s) => s.id === step);
  const next = () => setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)].id);
  const back = () => setStep(STEPS[Math.max(idx - 1, 0)].id);

  const b = workspace.booking;
  const guest = workspace.booking.guest;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <ol className="space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${i === idx ? "bg-primary/10 font-medium" : "text-muted-foreground"}`}>
            {i < idx ? <CheckCircle2 className="size-4 text-[color:var(--os-success)]" /> : <Circle className="size-4" />} {s.label}
          </li>
        ))}
      </ol>
      <div className="rounded-xl border bg-card p-6">
        {step === "verify" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Reservation {b.reference}</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Check-in</dt><dd>{b.check_in}</dd>
              <dt className="text-muted-foreground">Check-out</dt><dd>{b.check_out}</dd>
              <dt className="text-muted-foreground">Nights</dt><dd>{b.nights}</dd>
              <dt className="text-muted-foreground">Room</dt><dd>{b.room?.name}</dd>
              <dt className="text-muted-foreground">Guests</dt><dd>{b.adults} adults{b.children ? `, ${b.children} children` : ""}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{b.status}</dd>
            </dl>
          </div>
        )}
        {step === "guest" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Guest</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Name</dt><dd>{b.guest_name}</dd>
              <dt className="text-muted-foreground">Email</dt><dd>{b.guest_email}</dd>
              <dt className="text-muted-foreground">Phone</dt><dd>{b.guest_phone ?? "—"}</dd>
              <dt className="text-muted-foreground">Country</dt><dd>{b.country ?? "—"}</dd>
              {guest?.total_stays !== undefined && (<><dt className="text-muted-foreground">Previous stays</dt><dd>{guest.total_stays}</dd></>)}
            </dl>
            {guest?.ai_summary && <p className="rounded bg-muted/40 p-3 text-xs">{guest.ai_summary}</p>}
          </div>
        )}
        {step === "payment" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Payment status</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Total</dt><dd className="tabular-nums">{b.currency} {b.total}</dd>
              <dt className="text-muted-foreground">Deposit</dt><dd className="tabular-nums">{b.currency} {b.deposit_amount}</dd>
              <dt className="text-muted-foreground">Balance</dt><dd className="tabular-nums font-semibold">{b.currency} {b.balance_amount}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{b.payment_status}</dd>
            </dl>
          </div>
        )}
        {step === "assign" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Assign a physical room</h3>
            <Select value={roomStateId} onValueChange={setRoomStateId}>
              <SelectTrigger><SelectValue placeholder="Choose unit…" /></SelectTrigger>
              <SelectContent>
                {workspace.roomStates.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.unit_label} — {r.state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {step === "notes" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Notes</h3>
            <div>
              <Label>Arrival time</Label>
              <Input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
            </div>
            <div>
              <Label>Operational notes</Label>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special handling…" />
            </div>
          </div>
        )}
        {step === "confirm" && (
          <div className="space-y-3">
            <h3 className="font-semibold">Confirm check-in</h3>
            <p className="text-sm text-muted-foreground">
              {b.guest_name} will be checked into {workspace.roomStates.find((r: any) => r.id === roomStateId)?.unit_label ?? b.room?.name} at {arrivalTime}.
            </p>
          </div>
        )}
        {step === "portal" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Check-in complete — Guest Portal access</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The guest credential was issued after the authoritative check-in succeeded. The QR code and shareable URL use the same credential.
              </p>
            </div>
            {guestPortalLink ? (
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="flex flex-col items-center gap-2">
                  {guestPortalQr ? (
                    <img src={guestPortalQr} alt="StayNas Guest Portal QR code" className="h-44 w-44 rounded bg-white p-1" />
                  ) : (
                    <div className="flex h-44 w-44 items-center justify-center rounded bg-muted text-xs text-muted-foreground">Generating QR…</div>
                  )}
                  {guestPortalQr && (
                    <a href={guestPortalQr} download={`staynas-guest-portal-${workspace.booking.id}.png`} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <Download className="size-3.5" /> Download QR
                    </a>
                  )}
                </div>
                <div className="min-w-0 space-y-3">
                  <p className="break-all font-mono text-xs">{guestPortalLink}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(guestPortalLink);
                        toast.success("Guest Portal link copied");
                      } catch {
                        toast.error("Clipboard access is unavailable on this device.");
                      }
                    }}
                  >
                    <Copy className="mr-1.5 size-3.5" /> Copy guest link
                  </Button>
                  <p className="text-xs text-muted-foreground">Keep this link private. Access is property- and reservation-scoped and expires at the configured checkout time.</p>
                </div>
              </div>
            ) : (
              <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                Check-in succeeded, but an active credential already existed or automatic issuance could not return a new bearer link. Open the reservation workspace to inspect status and regenerate access if necessary.
              </p>
            )}
            <Button onClick={() => nav({ to: "/admin/operations/reservations/$id", params: { id: workspace.booking.id } })}>
              Open reservation workspace
            </Button>
          </div>
        )}
        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={back} disabled={idx === 0}>Back</Button>
          {step === "portal" ? (
            <Button onClick={() => nav({ to: "/admin/operations/reservations/$id", params: { id: workspace.booking.id } })}>Done</Button>
          ) : step === "confirm" ? (
            <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Checking in…" : "Complete check-in"}</Button>
          ) : (
            <Button onClick={next}>Continue</Button>
          )}
        </div>
      </div>
    </div>
  );
}