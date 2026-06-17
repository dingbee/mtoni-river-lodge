import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Review, ReviewAggregate } from "./reviews";

function publicClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const REVIEW_COLS =
  "id, source, guest_name, guest_location, rating, title, review_text, review_date, categories, status, featured, external_url, created_at, updated_at";

// ---------------- PUBLIC ----------------

const listSchema = z.object({
  category: z.string().optional(),
  source: z.enum(["google", "tripadvisor", "direct"]).optional(),
  featuredOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listApprovedReviews = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<Review[]> => {
    const sb = publicClient();
    let q = sb
      .from("reviews")
      .select(REVIEW_COLS)
      .eq("status", "approved")
      .order("featured", { ascending: false })
      .order("review_date", { ascending: false })
      .limit(data.limit);
    if (data.source) q = q.eq("source", data.source);
    if (data.featuredOnly) q = q.eq("featured", true);
    if (data.category) q = q.contains("categories", [data.category]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Review[];
  });

export const getReviewAggregates = createServerFn({ method: "GET" })
  .handler(async (): Promise<ReviewAggregate[]> => {
    const sb = publicClient();
    const { data, error } = await sb.rpc("get_review_aggregates");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      source: r.source,
      average_rating: Number(r.average_rating),
      review_count: Number(r.review_count),
    }));
  });

// ---------------- ADMIN ----------------

const reviewInputSchema = z.object({
  source: z.enum(["google", "tripadvisor", "direct"]),
  guest_name: z.string().min(1).max(120),
  guest_location: z.string().max(120).nullish(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).nullish(),
  review_text: z.string().min(1).max(5000),
  review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.array(z.enum([
    "hospitality_service","tranquility_nature","safari_gateway",
    "rooms_comfort","dining","pool_family","overall_experience",
  ])).default([]),
  status: z.enum(["pending", "approved", "archived"]).default("pending"),
  featured: z.boolean().default(false),
  external_url: z.string().url().nullish().or(z.literal("")),
});

export const listAllReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(["all", "pending", "approved", "archived"]).default("all"),
      source: z.enum(["all", "google", "tripadvisor", "direct"]).default("all"),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    let q = context.supabase.from("reviews").select(REVIEW_COLS).order("created_at", { ascending: false }).limit(500);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.source !== "all") q = q.eq("source", data.source);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Review[];
  });

export const createReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const payload = {
      ...data,
      external_url: data.external_url || null,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("reviews").insert(payload).select(REVIEW_COLS).single();
    if (error) throw new Error(error.message);
    return row as Review;
  });

export const updateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), patch: reviewInputSchema.partial() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const patch: any = { ...data.patch };
    if (patch.external_url === "") patch.external_url = null;
    const { data: row, error } = await context.supabase
      .from("reviews").update(patch).eq("id", data.id).select(REVIEW_COLS).single();
    if (error) throw new Error(error.message);
    return row as Review;
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { error } = await context.supabase.from("reviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });