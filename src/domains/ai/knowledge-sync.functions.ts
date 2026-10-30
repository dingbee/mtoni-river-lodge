import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { getActivePropertyAiRoles } from "@/domains/ai/ai.authorization.server";

const APPROVER_ROLES = ["owner", "manager", "reception"] as const;
const SOURCE_TYPES = [
  "document",
  "website_page",
  "journal_article",
  "experience",
  "room",
  "policy",
  "other",
] as const;
const STATUSES = ["pending", "processing", "approved", "archived", "failed"] as const;

function knowledgeReviewDueAt(sourceType: string, now = new Date()): string {
  const days: Record<string, number> = { room: 30, experience: 60, website_page: 30, journal_article: 90, policy: 180, document: 180, other: 90 };
  const due = new Date(now);
  due.setUTCDate(due.getUTCDate() + (days[sourceType] ?? 90));
  return due.toISOString();
}

async function assertStaff(sb: any, userId: string) {
  if (process.env.STAYNAS_PROPERTY_KNOWLEDGE_SCHEMA_ENABLED !== "true") {
    throw new Error("Property knowledge workspace is waiting for its database migration and isolation verification.");
  }
  const scope = await getActivePropertyAiRoles(sb, userId);
  const allowed = ["owner", "manager", "admin", "reservations", "reception", "marketing", "finance", "housekeeping"];
  if (!scope.roles.some((role) => allowed.includes(role))) throw new Error("Forbidden");
  return scope.propertyId;
}
async function assertApprover(sb: any, userId: string) {
  if (process.env.STAYNAS_PROPERTY_KNOWLEDGE_SCHEMA_ENABLED !== "true") {
    throw new Error("Property knowledge workspace is waiting for its database migration and isolation verification.");
  }
  const scope = await getActivePropertyAiRoles(sb, userId);
  const allowed = [...APPROVER_ROLES, "admin"];
  if (!scope.roles.some((role) => allowed.includes(role))) throw new Error("Forbidden");
  return scope.propertyId;
}

export interface AiKnowledgeSource {
  id: string;
  source_type: (typeof SOURCE_TYPES)[number];
  external_ref: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  content: string;
  metadata: any;
  status: (typeof STATUSES)[number];
  last_synced_at: string | null;
  indexed_at: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  property_id: string;
  language_code: string;
  is_guest_visible: boolean;
  source_updated_at: string | null;
  review_due_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Listing ----------
export const listKnowledgeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z
      .object({
        source_type: z.enum(SOURCE_TYPES).optional(),
        status: z.enum([...STATUSES, "all"]).default("all"),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_knowledge_sources")
      .select(
        "id, property_id, source_type, external_ref, title, url, summary, status, is_guest_visible, language_code, source_updated_at, review_due_at, last_synced_at, indexed_at, metadata, created_at, updated_at",
      )
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.source_type) q = q.eq("source_type", data.source_type);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AiKnowledgeSource[];
  });

export const getKnowledgeSource = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("ai_knowledge_sources")
      .select("*")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .single();
    if (error) throw new Error(error.message);
    return row as AiKnowledgeSource;
  });

// ---------- Manual upsert ----------
const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  source_type: z.enum(SOURCE_TYPES).default("document"),
  external_ref: z.string().max(300).nullable().optional(),
  title: z.string().min(2).max(300),
  url: z.string().url().nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  content: z.string().max(200_000).default(""),
  metadata: z.record(z.string(), z.any()).default({}),
  language_code: z.enum(["en", "sw"]).default("en"),
  is_guest_visible: z.boolean().default(false),
  status: z.enum(STATUSES).default("pending"),
});

export const upsertKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => upsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const patch: any = {
      property_id: propertyId,
      source_type: data.source_type,
      external_ref: data.external_ref ?? null,
      title: data.title,
      url: data.url ?? null,
      summary: data.summary ?? null,
      content: data.content ?? "",
      metadata: data.metadata ?? {},
      language_code: data.language_code,
      is_guest_visible: data.is_guest_visible && data.status === "approved",
      status: data.status,
      source_updated_at: new Date().toISOString(),
      review_due_at: knowledgeReviewDueAt(data.source_type),
      indexed_at: new Date().toISOString(),
      ...(data.status === "approved" ? { reviewed_by: context.userId, reviewed_at: new Date().toISOString() } : {}),
    };
    let row: any;
    if (data.id) {
      const { data: r, error } = await sb
        .from("ai_knowledge_sources")
        .update(patch)
        .eq("id", data.id)
        .eq("property_id", propertyId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = r;
    } else {
      const { data: r, error } = await sb
        .from("ai_knowledge_sources")
        .insert({ ...patch, created_by: context.userId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = r;
    }
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "knowledge_sync.upsert_source",
      tool_args: { id: row.id, source_type: row.source_type, status: row.status },
      status: "ok",
    });
    return row as AiKnowledgeSource;
  });

// ---------- Status transitions ----------
export const setKnowledgeSourceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["approved", "archived", "pending"]) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: current, error: currentError } = await sb
      .from("ai_knowledge_sources")
      .select("source_type")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) throw new Error("Knowledge source not found in the active property.");
    const { data: row, error } = await sb
      .from("ai_knowledge_sources")
      .update({
        status: data.status,
        is_guest_visible: data.status === "approved" ? undefined : false,
        review_due_at: data.status === "approved" ? knowledgeReviewDueAt(current.source_type) : undefined,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .select("id, status, title, is_guest_visible")
      .single();
    if (error) throw new Error(error.message);
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: `knowledge_sync.set_status_${data.status}`,
      tool_args: { id: data.id },
      status: "ok",
    });
    return row;
  });

export const setKnowledgeSourceGuestVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({ id: z.string().uuid(), is_guest_visible: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: source, error: readError } = await sb
      .from("ai_knowledge_sources")
      .select("id, status, review_due_at")
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!source) throw new Error("Knowledge source not found in the active property.");
    if (data.is_guest_visible && source.status !== "approved") {
      throw new Error("Approve the source before enabling guest-facing answers.");
    }
    if (data.is_guest_visible && source.review_due_at && new Date(source.review_due_at).getTime() < Date.now()) {
      throw new Error("Refresh and re-review this source before enabling guest-facing answers.");
    }
    const { data: row, error } = await sb
      .from("ai_knowledge_sources")
      .update({
        is_guest_visible: data.is_guest_visible,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("property_id", propertyId)
      .select("id, status, title, is_guest_visible")
      .single();
    if (error) throw new Error(error.message);
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: data.is_guest_visible ? "knowledge_sync.enable_guest_visibility" : "knowledge_sync.disable_guest_visibility",
      tool_args: { id: data.id },
      status: "ok",
    });
    return row;
  });

export const deleteKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertApprover(context.supabase, context.userId);
    const { error } = await context.supabase.from("ai_knowledge_sources").delete().eq("id", data.id).eq("property_id", propertyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Global content adapters (intentionally deferred) ----------
export const syncJournalArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    await assertApprover(context.supabase, context.userId);
    return { upserted: 0, skipped: true, reason: "journal_articles_not_property_scoped" };
  });

export const syncCmsPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    await assertApprover(context.supabase, context.userId);
    return { upserted: 0, skipped: true, reason: "cms_pages_not_property_scoped" };
  });

// ---------- Sync: Rooms & Experiences (from CMS pages tagged) ----------
export const syncRoomsAndExperiences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rooms } = await sb
      .from("rooms")
      .select("id, slug, name, short_description, base_price, currency, capacity_adults, capacity_children, max_occupancy, status, updated_at")
      .eq("property_id", propertyId)
      .eq("status", "active");
    let upserted = 0;
    for (const r of rooms ?? []) {
      const content = [
        r.short_description,
        `Capacity: up to ${r.max_occupancy} guests (${r.capacity_adults} adults, ${r.capacity_children} children).`,
        `Base rate: ${r.currency} ${r.base_price}.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const { error } = await sb.from("ai_knowledge_sources").upsert(
        {
          property_id: propertyId,
          language_code: "en",
          is_guest_visible: false,
          source_updated_at: r.updated_at ?? new Date().toISOString(),
          review_due_at: knowledgeReviewDueAt("room"),
          source_type: "room",
          external_ref: r.id,
          title: r.name,
          url: `/rooms/${r.slug}`,
          summary: r.short_description?.slice(0, 240) ?? null,
          content,
          metadata: { slug: r.slug, base_price: r.base_price, currency: r.currency },
          status: "approved",
          last_synced_at: new Date().toISOString(),
          indexed_at: new Date().toISOString(),
          created_by: context.userId,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "property_id,source_type,external_ref" },
      );
      if (error) throw new Error(error.message);
      upserted++;
    }
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "knowledge_sync.sync_rooms",
      tool_args: { upserted },
      status: "ok",
    });
    return { upserted };
  });

// ---------- Test retrieval ----------
export const testKnowledgeQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: any) =>
    z.object({ query: z.string().min(3).max(500), limit: z.number().int().min(1).max(20).default(6) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertStaff(context.supabase, context.userId);
    if (process.env.STAYNAS_PROPERTY_KNOWLEDGE_SEARCH_ENABLED !== "true") {
      throw new Error("Property knowledge retrieval is disabled until database isolation verification is complete.");
    }
    const sb: any = context.supabase;
    const { data: hits, error } = await sb.rpc("staynas_property_knowledge_search", {
      _property_id: propertyId,
      _query: data.query,
      _limit: data.limit,
      _guest_visible_only: false,
    });
    if (error) throw new Error(error.message);
    const top = (hits ?? []) as Array<{
      source_id: string;
      source_kind: string;
      source_type: string;
      title: string;
      slug: string | null;
      category_slug: string | null;
      url: string | null;
      summary: string | null;
      content: string;
      language_code: string;
      source_updated_at: string | null;
      rank: number;
    }>;
    const confidence = top[0]?.rank ? Math.min(0.99, top[0].rank / 0.6) : 0;
    await sb.from("ai_knowledge_search_log").insert({
      property_id: propertyId,
      query: data.query,
      result_count: top.length,
      matched_source_ids: top.map((t: any) => t.source_id),
      confidence,
      asked_by: context.userId,
    });
    return { hits: top, confidence };
  });

// ---------- Analytics ----------
export const getKnowledgeAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "knowledge");
    const propertyId = await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();

    const { data: byType } = await sb
      .from("ai_knowledge_sources")
      .select("source_type, status")
      .eq("property_id", propertyId)
      .limit(2000);
    const counts: Record<string, { total: number; approved: number }> = {};
    for (const r of (byType ?? []) as any[]) {
      const t = r.source_type as string;
      counts[t] = counts[t] ?? { total: 0, approved: 0 };
      counts[t].total++;
      if (r.status === "approved") counts[t].approved++;
    }

    const { data: recent } = await sb
      .from("ai_knowledge_search_log")
      .select("query, result_count, confidence, created_at")
      .eq("property_id", propertyId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const failed = ((recent ?? []) as any[]).filter((r: any) => (r.result_count ?? 0) === 0);
    const failCount: Record<string, number> = {};
    for (const f of failed) failCount[f.query] = (failCount[f.query] ?? 0) + 1;
    const topUnanswered = Object.entries(failCount)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    const totalSearches = (recent ?? []).length;
    const successRate = totalSearches
      ? (totalSearches - failed.length) / totalSearches
      : 0;
    const avgConfidence =
      totalSearches > 0
        ? ((recent ?? []) as any[]).reduce((a: any, r: any) => a + (Number(r.confidence) || 0), 0) / totalSearches
        : 0;

    return { counts, topUnanswered, totalSearches, successRate, avgConfidence };
  });
