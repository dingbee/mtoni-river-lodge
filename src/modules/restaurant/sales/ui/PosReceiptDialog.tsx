/* eslint-disable @typescript-eslint/no-explicit-any -- receipt snapshot is untyped at this boundary. */
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money } from "./pos-types";

/** Renders the frozen receipt snapshot. Nothing here is recomputed. */
export function PosReceiptDialog({
  receipt,
  onClose,
  onReprint,
}: {
  receipt: any | null;
  onClose: () => void;
  onReprint?: () => void;
}) {
  if (!receipt) return null;
  const snapshot = receipt.snapshot ?? {};
  const currency = receipt.currency ?? "TZS";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt {receipt.receipt_number}</DialogTitle>
          <DialogDescription>
            Order {snapshot.order?.number} ·{" "}
            {receipt.reprint_count > 0 ? `reprint ×${receipt.reprint_count}` : "original"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 font-mono text-xs">
          {(snapshot.lines ?? []).map((l: any) => (
            <div key={l.id} className="flex justify-between gap-3">
              <span className="min-w-0">
                {Number(l.quantity)} × {l.description}
                {(l.modifiers ?? []).length > 0 && (
                  <span className="block pl-4 text-muted-foreground">
                    {(l.modifiers ?? []).map((m: any) => m.name).join(", ")}
                  </span>
                )}
                {l.seat_number ? <span className="block pl-4 text-muted-foreground">seat {l.seat_number}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums">{money(Number(l.line_total ?? 0), currency)}</span>
            </div>
          ))}

          <div className="space-y-1 border-t pt-2">
            <Row label="Subtotal" value={money(Number(receipt.subtotal ?? 0), currency)} />
            {Number(receipt.discount_total ?? 0) > 0 && (
              <Row label="Discount" value={`-${money(Number(receipt.discount_total), currency)}`} />
            )}
            {Number(receipt.service_charge ?? 0) > 0 && (
              <Row label="Service" value={money(Number(receipt.service_charge), currency)} />
            )}
            <Row label="Tax" value={money(Number(receipt.tax_total ?? 0), currency)} />
            <Row label="Total" value={money(Number(receipt.total ?? 0), currency)} bold />
          </div>

          <div className="space-y-1 border-t pt-2">
            {(snapshot.payments ?? []).map((p: any) => (
              <Row key={p.id} label={String(p.method).replace(/_/g, " ")} value={money(Number(p.amount ?? 0), currency)} />
            ))}
          </div>
        </div>

        <DialogFooter>
          {onReprint && (
            <Button variant="outline" onClick={onReprint}>
              Reprint
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="capitalize">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}