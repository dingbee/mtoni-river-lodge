import type { SupabaseClient } from "@supabase/supabase-js";

// Local RPC contract for the Phase 1 payment transaction. The generated
// database types are regenerated only after the reviewed SQL is applied.
type RpcResult<T> = Promise<{ data: T | null; error: { message: string; code?: string } | null }>;

export interface RecordBookingPaymentResult {
  ok: boolean;
  duplicate: boolean;
  event_id: string;
  paid_amount: number;
  balance_amount: number;
  payment_status: "unpaid" | "deposit_paid" | "paid" | "refunded" | "payment_mismatch";
}

interface FinanceRpcContract {
  rpc(
    fn: "record_booking_payment",
    args: {
      _booking_id: string;
      _amount: number;
      _event_type: "manual_payment" | "refund";
      _method: string;
      _note: string | null;
      _idempotency_key: string;
    },
  ): RpcResult<RecordBookingPaymentResult>;
}

export function financeRpc(client: SupabaseClient): FinanceRpcContract {
  return client as unknown as FinanceRpcContract;
}
