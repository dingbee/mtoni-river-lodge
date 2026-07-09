import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "./activity-log.server";
import type { ReviewStatistics } from "./reviews";

function publicClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const STATS_COLS = "source, overall_rating, total_reviews, profile_url, updated_at";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const listReviewStatistics = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReviewStatistics[]> => {
    const sb = publicClient();
    const { data, error } = await sb.from("review_statistics").select(STATS_COLS);
    if (error) throw new Error(error.message);
    return (data ?? []) as ReviewStatistics[];
  },
);

const upsertSchema = z.object({
  source: z.enum(["google", "tripadvisor", "direct"]),
  overall_rating: z.number().min(0).max(5),
  total_reviews: z.number().int().min(0).max(1_000_000),
  profile_url: z.string().url().nullish().or(z.literal("")),
});

export const upsertReviewStatistic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);

    const { data: prev } = await context.supabase
      .from("review_statistics")
      .select(STATS_COLS)
      .eq("source", data.source)
      .maybeSingle();

    const payload = {
      source: data.source,
      overall_rating: data.overall_rating,
      total_reviews: data.total_reviews,
      profile_url: data.profile_url || null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    const { data: row, error } = await context.supabase
      .from("review_statistics")
      .upsert(payload, { onConflict: "source" })
      .select(STATS_COLS)
      .single();
    if (error) throw new Error(error.message);

    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "statistics_updated",
      entityType: "review_statistics",
      entityLabel: `${data.source} stats`,
      previousValue: prev ?? null,
      newValue: row,
    });

    return row as ReviewStatistics;
  });