import { calculateReservationFinancials } from "@/domains/finance/reservation-financials";

interface ReservationFinancialSummaryProps {
  total: number | string | null | undefined;
  depositRequired: number | string | null | undefined;
  paidToDate: number | string | null | undefined;
  currency: string | null | undefined;
  className?: string;
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "—"} ${value.toFixed(2)}`;
  }
}

export function ReservationFinancialSummary({
  total,
  depositRequired,
  paidToDate,
  currency,
  className,
}: ReservationFinancialSummaryProps) {
  const values = calculateReservationFinancials({ total, depositRequired, paidToDate });
  const code = currency || "—";
  const metrics = [
    { label: "Reservation total", value: values.reservationTotal, detail: "Contracted booking value" },
    { label: "Deposit required", value: values.depositRequired, detail: "Required initial payment" },
    { label: "Paid to date", value: values.paidToDate, detail: "Recorded payments less refunds" },
    { label: "Outstanding", value: values.outstanding, detail: "Total less net paid" },
    { label: "Balance due at check-in", value: values.balanceDueAtCheckIn, detail: "Total less required deposit" },
  ];

  return (
    <section className={`rounded-lg border border-border bg-card p-4 ${className ?? ""}`}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Reservation financials</h3>
        <p className="text-xs text-muted-foreground">
          Contract value, payment position and arrival balance are shown separately · {code}
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{metric.label}</dt>
            <dd className="mt-0.5 break-words text-base font-semibold tabular-nums">
              {formatMoney(metric.value, code)}
            </dd>
            <p className="text-[0.7rem] text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}
