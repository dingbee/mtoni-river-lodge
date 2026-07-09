import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "./activity-log.server";
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
  "id, source, guest_name, guest_location, rating, title, review_text, review_date, categories, status, featured, external_url, created_at, updated_at, original_review, short_summary, medium_summary, imported_from, review_url, imported_at";

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
    // Prefer editable statistics from review_statistics; fall back to
    // aggregated approved reviews when no row is configured.
    const [{ data: stats }, { data: agg }] = await Promise.all([
      sb.from("review_statistics").select("source, overall_rating, total_reviews"),
      sb.rpc("get_review_aggregates"),
    ]);
    const byStat = new Map<string, any>((stats ?? []).map((s: any) => [s.source, s]));
    const bySource = new Map<string, any>(((agg as any[]) ?? []).map((a: any) => [a.source, a]));
    const sources = new Set<string>([...byStat.keys(), ...bySource.keys()] as string[]);
    return Array.from(sources).map((src) => {
      const s = byStat.get(src);
      const a = bySource.get(src);
      return {
        source: src as ReviewAggregate["source"],
        average_rating: s ? Number(s.overall_rating) : Number(a?.average_rating ?? 5),
        review_count: s ? Number(s.total_reviews) : Number(a?.review_count ?? 0),
      };
    });
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
  original_review: z.string().max(10000).nullish(),
  short_summary: z.string().max(500).nullish(),
  medium_summary: z.string().max(1500).nullish(),
  imported_from: z.string().max(40).nullish(),
  review_url: z.string().url().nullish().or(z.literal("")),
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
    const payload: any = {
      ...data,
      external_url: data.external_url || null,
      review_url: data.review_url || null,
      created_by: context.userId,
      last_modified_by: context.userId,
      last_modified_at: new Date().toISOString(),
    };
    if (data.imported_from) {
      payload.imported_by = context.userId;
      payload.imported_at = new Date().toISOString();
    }
    const { data: row, error } = await context.supabase
      .from("reviews").insert(payload).select(REVIEW_COLS).single();
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: data.imported_from ? "review_imported" : "review_created",
      entityType: "review",
      entityId: (row as any).id,
      entityLabel: `${data.guest_name} (${data.source})`,
      newValue: row,
    });
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
    if (patch.review_url === "") patch.review_url = null;
    patch.last_modified_by = context.userId;
    patch.last_modified_at = new Date().toISOString();

    const { data: prev } = await context.supabase
      .from("reviews").select(REVIEW_COLS).eq("id", data.id).maybeSingle();

    const { data: row, error } = await context.supabase
      .from("reviews").update(patch).eq("id", data.id).select(REVIEW_COLS).single();
    if (error) throw new Error(error.message);

    let action = "review_edited";
    if (prev && (prev as any).status !== (row as any).status) {
      action = (row as any).status === "approved" ? "review_published" : "review_unpublished";
    } else if (prev && (prev as any).featured !== (row as any).featured) {
      action = (row as any).featured ? "featured_enabled" : "featured_disabled";
    }
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action,
      entityType: "review",
      entityId: data.id,
      entityLabel: `${(row as any).guest_name} (${(row as any).source})`,
      previousValue: prev ?? null,
      newValue: row,
    });
    return row as Review;
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: prev } = await context.supabase
      .from("reviews").select(REVIEW_COLS).eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("reviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, {
      actorId: context.userId,
      actorEmail: (context.claims as any)?.email ?? null,
      action: "review_deleted",
      entityType: "review",
      entityId: data.id,
      entityLabel: prev ? `${(prev as any).guest_name} (${(prev as any).source})` : "unknown",
      previousValue: prev ?? null,
    });
    return { ok: true };
  });