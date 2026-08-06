import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, QrCode } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatusChip } from "@/components/os/StatusChip";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import { ArrivalPassScanner } from "../components/ArrivalPassScanner";
import { confirmArrivalPass, validateArrivalPass } from "../services/arrival-pass.functions";
import { PASS_STATUS_LABEL, passStatusTone, type ScanResult } from "../services/arrival-pass-shared";
import { getClientContext } from "../services/checkin-client";

function Rows({ rows }: { rows: [string, unknown][] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-4 py-2">
          <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">
            {value === null || value === undefined || value === "" ? "—" : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StaffArrivalScanPage() {
  const queryClient = useQueryClient();
  const validate = useServerFn(validateArrivalPass);
  const confirm = useServerFn(confirmArrivalPass);
  const [token, setToken] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["staff-arrivals"] });
    void queryClient.invalidateQueries({ queryKey: ["staff-arrival-detail"] });
  };

  const scanMutation = useAdminMutation({
    mutationFn: (passToken: string) =>
      validate({ data: { passToken, client: getClientContext() } }) as Promise<ScanResult>,
    loadingMessage: "Checking arrival pass…",
    successMessage: "Arrival pass checked",
    onSuccess: (data: ScanResult) => {
      setResult(data);
      invalidate();
    },
  });

  const confirmMutation = useAdminMutation({
    mutationFn: (passToken: string) =>
      confirm({ data: { passToken, client: getClientContext() } }) as Promise<ScanResult>,
    loadingMessage: "Confirming arrival…",
    successMessage: "Arrival confirmed",
    onSuccess: (data: ScanResult) => {
      setResult(data);
      invalidate();
    },
  });

  const handleToken = (value: string) => {
    setToken(value);
    setResult(null);
    scanMutation.mutate(value);
  };

  const reservation = result?.reservation;
  const busy = scanMutation.isPending || confirmMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan arrival pass"
        description="Verify a guest's digital arrival pass against live reservation data and complete arrival at the desk."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/operations/arrivals">All arrivals</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Scanner" description="Camera or manual pass code.">
          <ArrivalPassScanner onToken={handleToken} busy={busy} />
        </SectionCard>

        <SectionCard
          title="Verification"
          description="Always resolved live — the QR code carries no guest data."
        >
          {!result ? (
            <EmptyState
              title="No pass scanned yet"
              description="Scan a guest's arrival pass to load their reservation."
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-[color:var(--os-success)]" aria-hidden />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-[color:var(--os-danger)]" aria-hidden />
                )}
                <span className="text-sm font-medium text-foreground">{result.message}</span>
                {result.pass && (
                  <StatusChip tone={passStatusTone(result.pass.status)}>
                    {PASS_STATUS_LABEL[result.pass.status] ?? result.pass.status}
                  </StatusChip>
                )}
              </div>

              {reservation ? (
                <>
                  <Rows
                    rows={[
                      ["Guest", reservation.guest_name],
                      ["Reference", reservation.reference],
                      [
                        "Stay",
                        `${reservation.check_in} → ${reservation.check_out} · ${reservation.nights} nights`,
                      ],
                      [
                        "Room",
                        reservation.unit_label
                          ? `${reservation.room_name} · ${reservation.unit_label}`
                          : reservation.room_name,
                      ],
                      ["Reservation status", String(reservation.status).replace("_", " ")],
                      [
                        "Balance",
                        `${reservation.currency} ${Number(reservation.balance_amount ?? 0).toFixed(2)}`,
                      ],
                      ["ETA", reservation.estimated_arrival_time],
                      ["Special requests", reservation.special_requests],
                      [
                        "Documents",
                        `${result.documents?.verified ?? 0} verified of ${result.documents?.total ?? 0}`,
                      ],
                    ]}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!result.ok || busy || result.code === "confirmed"}
                      onClick={() => token && confirmMutation.mutate(token)}
                    >
                      <QrCode className="mr-2 h-4 w-4" /> Confirm arrival
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to="/admin/operations/arrivals/$id"
                        params={{ id: reservation.id }}
                      >
                        Open check-in review
                      </Link>
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}