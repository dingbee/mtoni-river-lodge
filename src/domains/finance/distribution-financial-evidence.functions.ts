import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

type ProviderEvidenceRow = {
  id: string;
  property_id: string;
  booking_id: string | null;
  provider_key: string;
  environment: string;
  external_reservation_id: string;
  event_type: string;
  provider_reference: string | null;
  evidence: Record<string, unknown>;
  reconciliation_status: "unmatched" | "evidence_received" | "review_required" | "duplicate_reference";
  reconciliation_code: string | null;
  received_at: string;
};

const inputSchema = z.object({
  status: z.enum(["all", "unmatched", "review_required", "duplicate_reference", "evidence_received"]).default("all"),
  limit: z.number().int().min(1).max(200).default(100),
}).default({ status: "all", limit: 100 });

export const listDistributionFinancialEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");

    // RLS enforces finance role + active-property scope. The evidence table
    // intentionally has no authenticated write permission.
    let query = (context.supabase as any)
      .from("staynas_distribution_financial_evidence")
      .select("id,property_id,booking_id,provider_key,environment,external_reservation_id,event_type,provider_reference,evidence,reconciliation_status,reconciliation_code,received_at")
      .order("received_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") query = query.eq("reconciliation_status", data.status);

    const { data: evidenceRows, error } = await query;
    if (error) throw new Error("Unable to load provider financial evidence.");
    const rows = (evidenceRows ?? []) as ProviderEvidenceRow[];
    const bookingIds = Array.from(new Set(rows.map((row) => row.booking_id).filter((id): id is string => Boolean(id))));

    const bookingsById = new Map<string, {
      reference: string;
      currency: string | null;
      payment_status: string | null;
      paid_amount: number | null;
      balance_amount: number | null;
    }>();
    if (bookingIds.length) {
      const { data: bookings, error: bookingError } = await context.supabase
        .from("bookings")
        .select("id,reference,currency,payment_status,paid_amount,balance_amount")
        .in("id", bookingIds);
      if (bookingError) throw new Error("Unable to load canonical booking reconciliation context.");
      for (const booking of bookings ?? []) {
        bookingsById.set(booking.id, {
          reference: booking.reference,
          currency: booking.currency,
          payment_status: booking.payment_status,
          paid_amount: booking.paid_amount,
          balance_amount: booking.balance_amount,
        });
      }
    }

    return rows.map((row) => ({
      ...row,
      booking: row.booking_id ? bookingsById.get(row.booking_id) ?? null : null,
    }));
  });
