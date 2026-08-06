import { useEffect, useState } from "react";
import { CalendarDays, DoorOpen, Hash, ShieldCheck } from "lucide-react";
import { StatusChip } from "@/components/os/StatusChip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PASS_STATUS_LABEL,
  buildQrPayload,
  passStatusTone,
  type ArrivalPassStay,
  type ArrivalPassView,
} from "../services/arrival-pass-shared";

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="break-words text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

/** Mobile-first digital arrival pass. The QR encodes only the pass token. */
export function ArrivalPassCard({ pass, stay }: { pass: ArrivalPassView; stay: ArrivalPassStay }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const QRCode = await import("qrcode");
      const url = await QRCode.toDataURL(buildQrPayload(pass.token), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 640,
        color: { dark: "#111315", light: "#ffffff" },
      });
      if (alive) setQr(url);
    })();
    return () => {
      alive = false;
    };
  }, [pass.token]);

  const usable = pass.status === "active";

  return (
    <div className="mx-auto w-full max-w-md rounded-[20px] border border-border bg-card p-6 shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Mtoni River Lodge
          </p>
          <h2 className="mt-1 font-display text-2xl leading-tight text-foreground">Arrival pass</h2>
        </div>
        <StatusChip tone={passStatusTone(pass.status)}>
          {PASS_STATUS_LABEL[pass.status] ?? pass.status}
        </StatusChip>
      </div>

      <div className="mt-6 flex justify-center">
        {qr ? (
          <img
            src={qr}
            alt={`Arrival pass QR code for reservation ${stay.reference}`}
            width={240}
            height={240}
            className={`h-60 w-60 rounded-xl bg-white p-3 ${usable ? "" : "opacity-40 grayscale"}`}
          />
        ) : (
          <Skeleton className="h-60 w-60 rounded-xl" />
        )}
      </div>

      {!usable && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {pass.status === "used"
            ? "Arrival already completed at reception."
            : "This pass is no longer scannable — reception will assist you on arrival."}
        </p>
      )}

      <div className="mt-6 divide-y divide-border border-t border-border">
        <Row icon={<Hash className="h-4 w-4" />} label="Reservation" value={stay.reference} />
        <Row icon={<ShieldCheck className="h-4 w-4" />} label="Guest" value={stay.guest_name} />
        <Row
          icon={<CalendarDays className="h-4 w-4" />}
          label="Stay"
          value={`${stay.check_in} → ${stay.check_out} · ${stay.nights} night${stay.nights === 1 ? "" : "s"}`}
        />
        <Row
          icon={<DoorOpen className="h-4 w-4" />}
          label="Room"
          value={stay.unit_label ? `${stay.room_name} · ${stay.unit_label}` : stay.room_name}
        />
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Issued {new Date(pass.issued_at).toLocaleString()} · valid until{" "}
        {new Date(pass.expires_at).toLocaleDateString()}
      </p>
    </div>
  );
}