import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).default({});

export type DistributionAnalyticsProjection = {
  propertyId: string;
  window: { from: string; to: string };
  operations: {
    total: number; queued: number; running: number; retryableFailure: number;
    succeeded: number; permanentFailure: number; cancelled: number;
    successRate: number; averageAttempts: number;
  };
  attempts: {
    total: number; succeeded: number; retryableFailure: number;
    permanentFailure: number; leaseExpired: number;
  };
  outbox: {
    total: number; pending: number; publishing: number; published: number;
    retryableFailure: number; permanentFailure: number;
  };
  webhooks: {
    total: number; received: number; processing: number; processed: number;
    retryableFailure: number; permanentFailure: number; ignored: number;
  };
  reservations: { imported: number };
  financialEvidence: {
    total: number; unmatched: number; evidenceReceived: number;
    reviewRequired: number; duplicateReference: number;
  };
  health: {
    checks: number; healthy: number; degraded: number; unavailable: number; unknown: number;
  };
  semantics: {
    source: "authoritative_distribution_ledgers";
    readOnly: true;
    currencyAggregation: false;
    financialEvidenceIsPayment: false;
  };
};

function defaultWindow() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const getDistributionAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<DistributionAnalyticsProjection> => {
    const defaults = defaultWindow();
    const from = data.from ?? defaults.from;
    const to = data.to ?? defaults.to;
    const { data: projection, error } = await context.supabase.rpc(
      "staynas_get_distribution_analytics",
      { _from: from, _to: to },
    );
    if (error) throw new Error(error.message);
    if (!projection || typeof projection !== "object") {
      throw new Error("Distribution analytics projection was not returned.");
    }
    return projection as DistributionAnalyticsProjection;
  });
