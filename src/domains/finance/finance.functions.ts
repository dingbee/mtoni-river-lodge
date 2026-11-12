import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { financeRpc } from "@/lib/finance-rpc";
import { recordManualPaymentInputSchema } from "./payment-contract";
import { moneyByCurrency, sumCurrency } from "./finance-currency";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RevenueFilters = {
  from?: string; // ISO date
  to?: string;
  roomId?: string | null;
  source?: string | null;
  country?: string | null;
  paymentMethod?: string | null;
};

const filtersSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    roomId: z.string().uuid().nullable().optional(),
    source: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
  })
  .default({});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date¶»§q«^