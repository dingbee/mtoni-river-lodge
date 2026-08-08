/* eslint-disable @typescript-eslint/no-explicit-any -- server rows are untyped at this boundary. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { POS_PAYMENT_METHODS, type PosPaymentMethod } from "../pos.contracts";
import { money } from "./pos-types";

const METHOD_LABELS: Record<PosPaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  room_charge: "Charge to room",
  voucher: "Voucher",
  comp: "Comp",
};

/**
 * Settlement pad. Splitting is just paying less than the balance — the bill
 * stays open until the server reports it settled.
 */
export function PosPaymentDialog({
  open,
  currency,
  total,
  paid,
  pending,
  onClose,
  onPay,
}: {
  open: boolean;
  currency: string;
  total: number;
  paid: number;
  pending: boolean;
  onClose: () => void;
  onPay: (input: { method: PosPaymentMethod; amount: number; tendered?: number; reference?: string }) => void;
}) {
  const balance = Number(Math.max(0, total - paid).toFixed(2));
  const [method, setMethod] = useState<PosPaymentMethod>("cash");
  const [amount, setAmount] = useState<string>("");
  const [tendered, setTendered] = useState<string>("");
  const [reference, setReference] = useState("");

  const value = amount === "" ? balance : Number(amount);
  const tenderedValue = tendered === "" ? undefined : Number(tendered);
  const change = tenderedValue != null ? Math.max(0, Number((tenderedValue - value).toFixed(2))) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>
            Balance due {money(balance, currency)} of {money(total, currency)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {POS_PAYMENT_METHODS.map((m) => (
              <Button
                key={m}
                type="button"
                variant={method === m ? "default" : "outline"}
                className="min-h-12"
                onClick={() => setMethod(m)}
              >
                {METHOD_LABELS[m]}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Amount</Label>
              <Input inputMode="decimal" placeholder={String(balance)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {method === "cash" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tendered</Label>
                <Input inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} />
              </div>
            )}
            {method !== "cash" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Reference</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Auth / txn id" />
              </div>
            )}
          </div>

          {change > 0 && <p className="text-sm font-medium">Change due {money(change, currency)}</p>}
          {value > 0 && value < balance && (
            <p className="text-sm text-muted-foreground">
              Split payment — {money(balance - value, currency)} will remain on the bill.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || value <= 0}
            onClick={() =>
              onPay({
                method,
                amount: Number(value.toFixed(2)),
                tendered: tenderedValue,
                reference: reference || undefined,
              })
            }
          >
            {pending ? "Processing…" : `Charge ${money(value, currency)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}