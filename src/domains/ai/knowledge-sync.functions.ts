import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APPROVER_ROLES = ["owner", "manager", "admin", "reservations", "reception"] as const;
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

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertApprover(sb: any, userId: string) {
  const { data, error } = await sb.rpc("has_any_role", {
    _user_id: userId,
    _roles: APPROVER_ROLES as unknown as string[],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export interface AiKnowledgeSource {
  id: string;
  source_type: (typeof SOURCE_TYPES)[number];
  external_ref: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  content: string;
  metadata: Record<string, unknown>;
  status: (typeof STATUSES)[number];
  last_synced_at: string | null;
  indexed_at: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Listing ----------
export const listKnowledgeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
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
    await assertStaff(context.supabase, context.userId);
    let q: any = context.supabase
      .from("ai_knowledge_sources")
      .select(
        "id, source_type, external_ref, title, url, summary, status, last_synced_at, indexed_at, metadata, created_at, updated_at",
      )
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
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("ai_knowledge_sources")
      .select("*")
      .eq("id", data.id)
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
  status: z.enum(STATUSES).default("pending"),
});

export const upsertKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const patch: any = {
      source_type: data.source_type,
      external_ref: data.external_ref ?? null,
      title: data.title,
      url: data.url ?? null,
      summary: data.summary ?? null,
      content: data.content ?? "",
      metadata: data.metadata ?? {},
      status: data.status,
      indexed_at: new Date().toISOString(),
    };
    let row: any;
    if (data.id) {
      const { data: r, error } = await sb
        .from("ai_knowledge_sources")
        .update(patch)
        .eq("id", data.id)
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
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["approved", "archived", "pending"]) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: row, error } = await sb
      .from("ai_knowledge_sources")
      .update({
        status: data.status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id, status, title")
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

export const deleteKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertApprover(context.supabase, context.userId);
    const { error } = await context.supabase.from("ai_knowledge_sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Sync: Journal ----------
export const syncJournalArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: articles, error } = await sb
      .from("journal_articles")
      .select("id, slug, title, excerpt, content, status, published_at, updated_at, seo_title, seo_description")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    let upserted = 0;
    for (const a of articles ?? []) {
      const url = `/journal/${a.slug}`;
      const contentText = stripHtml(String(a.content ?? "")).slice(0, 180_000);
      const summary = a.excerpt ?? a.seo_description ?? null;
      const { error: upErr } = await sb.from("ai_knowledge_sources").upsert(
        {
          source_type: "journal_article",
          external_ref: a.id,
          title: a.title,
          url,
          summary,
          content: contentText,
          metadata: {
            slug: a.slug,
            published_at: a.published_at,
            updated_at: a.updated_at,
            seo_title: a.seo_title,
          },
          status: "approved",
          last_synced_at: new Date().toISOString(),
          indexed_at: new Date().toISOString(),
          created_by: context.userId,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "source_type,external_ref" },
      );
      if (upErr) throw new Error(upErr.message);
      upserted++;
    }

    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "knowledge_sync.sync_journal",
      tool_args: { upserted },
      status: "ok",
    });
    return { upserted };
  });

// ---------- Sync: CMS pages ----------
export const syncCmsPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: pages, error } = await sb
      .from("cms_pages")
      .select("id, slug, title, description, status, updated_at")
      .eq("status", "published")
      .limit(200);
    if (error) throw new Error(error.message);

    let upserted = 0;
    for (const p of pages ?? []) {
      const { data: blocks } = await sb
        .from("cms_blocks")
        .select("data, sort_order, type")
        .eq("page_id", p.id)
        .order("sort_order", { ascending: true });
      const content = (blocks ?? [])
        .map((b: any) => extractBlockText(b))
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 180_000);
      const url = p.slug === "home" || p.slug === "index" ? "/" : `/${p.slug}`;
      const { error: upErr } = await sb.from("ai_knowledge_sources").upsert(
        {
          source_type: "website_page",
          external_ref: p.id,
          title: p.title,
          url,
          summary: p.description ?? null,
          content,
          metadata: { slug: p.slug, updated_at: p.updated_at },
          status: "approved",
          last_synced_at: new Date().toISOString(),
          indexed_at: new Date().toISOString(),
          created_by: context.userId,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "source_type,external_ref" },
      );
      if (upErr) throw new Error(upErr.message);
      upserted++;
    }
    await sb.from("ai_activity_logs").insert({
      user_id: context.userId,
      tool_called: "knowledge_sync.sync_cms",
      tool_args: { upserted },
      status: "ok",
    });
    return { upserted };
  });

// ---------- Sync: Rooms & Experiences (from CMS pages tagged) ----------
export const syncRoomsAndExperiences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertApprover(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: rooms } = await sb
      .from("rooms")
      .select("id, slug, name, description, base_price, currency, capacity_adults, capacity_children, max_occupancy, status")
      .eq("status", "active");
    let upserted = 0;
    for (const r of rooms ?? []) {
      const content = [
        r.description,
        `Capacity: up to ${r.max_occupancy} guests (${r.capacity_adults} adults, ${r.capacity_children} children).`,
        `Base rate: ${r.currency} ${r.base_price}.`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const { error } = await sb.from("ai_knowledge_sources").upsert(
        {
          source_type: "room",
          external_ref: r.id,
          title: r.name,
          url: `/rooms/${r.slug}`,
          summary: r.description?.slice(0, 240) ?? null,
          content,
          metadata: { slug: r.slug, base_price: r.base_price, currency: r.currency },
          status: "approved",
          last_synced_at: new Date().toISOString(),
          indexed_at: new Date().toISOString(),
          created_by: context.userId,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        },
        { onConflict: "source_type,external_ref" },
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
  .inputValidator((input) =>
    z.object({ query: z.string().min(3).max(500), limit: z.number().int().min(1).max(20).default(6) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: hits, error } = await sb.rpc("ai_knowledge_sources_search", {
      _query: data.query,
      _limit: data.limit,
    });
    if (error) throw new Error(error.message);
    const top = (hits ?? []) as Array<{
      id: string;
      source_type: string;
      title: string;
      url: string | null;
      summary: string | null;
      content: string;
      rank: number;
    }>;
    const confidence = top[0]?.rank ? Math.min(0.99, top[0].rank / 0.6) : 0;
    await sb.from("ai_knowledge_search_log").insert({
      query: data.query,
      result_count: top.length,
      matched_source_ids: top.map((t) => t.id),
      confidence,
      asked_by: context.userId,
    });
    return { hits: top, confidence };
  });

// ---------- Analytics ----------
export const getKnowledgeAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();

    const { data: byType } = await sb
      .from("ai_knowledge_sources")
      .select("source_type, status")
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
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const failed = ((recent ?? []) as any[]).filter((r) => (r.result_count ?? 0) === 0);
    const failCount: Record<string, number> = {};
    for (const f of failed) failCount[f.query] = (failCount[f.query] ?? 0) + 1;
    const topUnanswered = Object.entries(failCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));

    const totalSearches = (recent ?? []).length;
    const successRate = totalSearches
      ? (totalSearches - failed.length) / totalSearches
      : 0;
    const avgConfidence =
      totalSearches > 0
        ? ((recent ?? []) as any[]).reduce((a, r) => a + (Number(r.confidence) || 0), 0) / totalSearches
        : 0;

    return { counts, topUnanswered, totalSearches, successRate, avgConfidence };
  });

// ---------- Helpers ----------
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function extractBlockText(block: any): string {
  const data = block?.data ?? {};
  const parts: string[] = [];
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === "string") {
      const s = stripHtml(v);
      if (s.length > 1) parts.push(s);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(data);
  return parts.join("\n");
}