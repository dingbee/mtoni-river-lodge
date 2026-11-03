import type { SupabaseClient } from "@supabase/supabase-js";

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
      _event_type: "manual_payment";
      _method: string;
      _note: string | null;
      _idempotency_key: string;
    },
  ): RpcResult<RecordBookingPaymentResult>;
  rpc(
    fn: "record_booking_refund",
    args: {
      _booking_id: string;
      _payment_event_id: string;
      _amount: number;
      _method: string;
      _note: string | null;
      _idempotency_key: string;
    },
  ): RpcResult<RecordBookingPaymentResult>;
}

export function financeRpc(client: SupabaseClient<any>): FinanceRpcContract {
  return client as unknown as FinanceRpcContract;
}
