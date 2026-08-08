import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSharedReceiptFn } from "@/modules/restaurant/receipts/delivery.functions";

export const Route = createFileRoute("/receipt/$token")({
  head: () => ({
    meta: [
      { title: "Your receipt — Mtoni River Lodge" },
      { name: "description", content: "View the receipt issued for your visit to Mtoni River Lodge." },
      { property: "og:title", content: "Your receipt — Mtoni River Lodge" },
      { property: "og:description", content: "A secure copy of the receipt issued at payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SharedReceiptPage,
});

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SharedReceiptPage() {
  const { token } = Route.useParams();
  const q = useQuery({
    queryKey: ["shared-receipt", token],
    queryFn: () => getSharedReceiptFn({ data: { token } }),
  });

  if (q.isLoading) return <main className="mx-auto max-w-md p-8 text-sm">Loading your receipt…</main>;
  const res = q.data;
  if (!res?.ok) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-lg font-semibold">Receipt unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {res?.reason === "expired"
            ? "This receipt link has expired. Please ask the restaurant for a new copy."
            : "This receipt link is not valid."}
        </p>
      </main>
    );
  }

  const r = res.receipt;
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <header>
        <h1 className="text-lg font-semibold">Receipt {r.number}</h1>
        <p className="text-xs text-muted-foreground">
          Issued {String(r.issuedAt ?? "").replace("T", " ").slice(0, 16)}
        </p>
      </header>
      <div className="space-y-1 font-mono text-xs">
        {r.lines.map((l: { description: string; quantity: number; amount: number }, i: number) => (
          <div key={`${l.description}-${i}`} className="flex justify-between gap-3">
            <span>
              {l.quantity} × {l.description}
            </span>
            <span className="tabular-nums">{fmt(l.amount, r.currency)}</span>
          </div>
        ))}
        <div className="mt-2 space-y-1 border-t pt-2">
          <Line label="Subtotal" value={fmt(r.subtotal, r.currency)} />
          {r.discountTotal > 0 && <Line label="Discount" value={`-${fmt(r.discountTotal, r.currency)}`} />}
          {r.serviceCharge > 0 && <Line label="Service" value={fmt(r.serviceCharge, r.currency)} />}
          <Line label="Tax" value={fmt(r.taxTotal, r.currency)} />
          <Line label="Total" value={fmt(r.total, r.currency)} />
          <Line label="Paid" value={fmt(r.paid, r.currency)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        This is a copy of the document issued at payment. Its figures cannot change.
      </p>
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}