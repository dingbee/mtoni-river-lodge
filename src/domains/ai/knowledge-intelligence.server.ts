// Server-only helpers for AI Knowledge intelligence & scheduled sync.
// Uses the service role client — DO NOT import at module scope from any
// route or *.functions.ts consumed by the client.

function stripHtml(html: string): string {
  return String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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

type TaskResult = { task: string; upserted: number; error?: string };

async function syncJournal(sb: any, userId: string | null): Promise<TaskResult> {
  const { data: articles, error } = await sb
    .from("journal_articles")
    .select("id, slug, title, excerpt, content_html, status, published_at, updated_at, seo_title, seo_description")
    .eq("status", "published")
    .limit(500);
  if (error) return { task: "journal", upserted: 0, error: error.message };
  let upserted = 0;
  const now = new Date().toISOString();
  for (const a of articles ?? []) {
    const content = stripHtml(a.content_html ?? "").slice(0, 180_000);
    await sb.from("ai_knowledge_sources").upsert(
      {
        source_type: "journal_article",
        external_ref: a.id,
        title: a.title,
        url: `/journal/${a.slug}`,
        summary: a.excerpt ?? a.seo_description ?? null,
        content,
        metadata: { slug: a.slug, published_at: a.published_at, seo_title: a.seo_title },
        status: "approved",
        last_synced_at: now,
        indexed_at: now,
        source_updated_at: a.updated_at ?? a.published_at ?? now,
        created_by: userId,
        reviewed_by: userId,
        reviewed_at: now,
      },
      { onConflict: "source_type,external_ref" },
    );
    upserted++;
  }
  return { task: "journal", upserted };
}

async function syncCms(sb: any, userId: string | null): Promise<TaskResult> {
  const { data: pages, error } = await sb
    .from("cms_pages")
    .select("id, slug, title, description, status, updated_at")
    .eq("status", "published")
    .limit(200);
  if (error) return { task: "cms", upserted: 0, error: error.message };
  let upserted = 0;
  const now = new Date().toISOString();
  for (const p of pages ?? []) {
    const { data: blocks } = await sb
      .from("cms_blocks")
      .select("data, position, kind")
      .eq("page_id", p.id)
      .order("position", { ascending: true });
    const content = (blocks ?? []).map((b: any) => extractBlockText(b)).filter(Boolean).join("\n\n").slice(0, 180_000);
    const url = p.slug === "home" || p.slug === "index" ? "/" : `/${p.slug}`;
    await sb.from("ai_knowledge_sources").upsert(
      {
        source_type: "website_page",
        external_ref: p.id,
        title: p.title,
        url,
        summary: p.description ?? null,
        content,
        metadata: { slug: p.slug },
        status: "approved",
        last_synced_at: now,
        indexed_at: now,
        source_updated_at: p.updated_at ?? now,
        created_by: userId,
        reviewed_by: userId,
        reviewed_at: now,
      },
      { onConflict: "source_type,external_ref" },
    );
    upserted++;
  }
  return { task: "cms", upserted };
}

async function syncRooms(sb: any, userId: string | null): Promise<TaskResult> {
  const { data: rooms, error } = await sb
    .from("rooms")
    .select("id, slug, name, short_description, base_price, currency, capacity_adults, capacity_children, max_occupancy, status, updated_at")
    .eq("status", "active");
  if (error) return { task: "rooms", upserted: 0, error: error.message };
  let upserted = 0;
  const now = new Date().toISOString();
  for (const r of rooms ?? []) {
    const content = [
      r.short_description,
      `Capacity: up to ${r.max_occupancy} guests (${r.capacity_adults} adults, ${r.capacity_children} children).`,
      `Base rate: ${r.currency} ${r.base_price}.`,
    ].filter(Boolean).join("\n\n");
    await sb.from("ai_knowledge_sources").upsert(
      {
        source_type: "room",
        external_ref: r.id,
        title: r.name,
        url: `/rooms/${r.slug}`,
        summary: (r.short_description ?? "").slice(0, 240) || null,
        content,
        metadata: { slug: r.slug, base_price: r.base_price, currency: r.currency },
        status: "approved",
        last_synced_at: now,
        indexed_at: now,
        source_updated_at: r.updated_at ?? now,
        created_by: userId,
        reviewed_by: userId,
        reviewed_at: now,
      },
      { onConflict: "source_type,external_ref" },
    );
    upserted++;
  }
  return { task: "rooms", upserted };
}

export async function runKnowledgeSyncJob(opts: { triggeredBy?: string } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sb: any = supabaseAdmin;

  const { data: cfg } = await sb.from("ai_knowledge_scheduler_config").select("*").eq("id", 1).single();
  if (!cfg?.enabled && opts.triggeredBy?.startsWith("cron")) {
    return { ok: false, skipped: true, reason: "scheduler_disabled" };
  }

  const { data: runRow } = await sb
    .from("ai_knowledge_sync_runs")
    .insert({
      status: "running",
      triggered_by: opts.triggeredBy ?? "manual",
      tasks: cfg?.tasks ?? ["journal", "cms", "rooms"],
    })
    .select("id")
    .single();
  const runId = runRow?.id;

  const enabledTasks: string[] = cfg?.tasks ?? ["journal", "cms", "rooms"];
  const results: TaskResult[] = [];
  let overallError: string | null = null;

  for (const t of enabledTasks) {
    try {
      if (t === "journal") results.push(await syncJournal(sb, null));
      else if (t === "cms") results.push(await syncCms(sb, null));
      else if (t === "rooms") results.push(await syncRooms(sb, null));
    } catch (e: any) {
      const message = e?.message ?? String(e);
      results.push({ task: t, upserted: 0, error: message });
      overallError = message;
    }
  }

  // Retry once for any failed task
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.error) continue;
    try {
      if (r.task === "journal") results[i] = await syncJournal(sb, null);
      else if (r.task === "cms") results[i] = await syncCms(sb, null);
      else if (r.task === "rooms") results[i] = await syncRooms(sb, null);
    } catch (e: any) {
      results[i] = { task: r.task, upserted: 0, error: e?.message ?? String(e) };
    }
  }

  const status = results.some((r) => r.error) ? "failed" : "succeeded";
  const finalError = results.filter((r) => r.error).map((r) => `${r.task}: ${r.error}`).join("; ") || overallError;

  if (runId) {
    await sb.from("ai_knowledge_sync_runs").update({
      finished_at: new Date().toISOString(),
      status,
      result: { tasks: results },
      error: finalError,
    }).eq("id", runId);
  }

  await sb.from("ai_knowledge_scheduler_config").update({
    last_run_at: new Date().toISOString(),
    last_status: status,
    last_error: finalError,
  }).eq("id", 1);

  if (status === "failed") {
    await sb.from("ai_knowledge_notifications").insert({
      notification_type: "sync_failed",
      severity: "error",
      title: "Knowledge sync failed",
      message: finalError ?? "Unknown error",
      metadata: { run_id: runId, results },
    });
  }

  // Freshness scan → notifications for newly stale approved sources
  try {
    const rules: Record<string, number> = {
      journal_article: 90,
      policy: 180,
      room: 30,
      experience: 60,
      website_page: 30,
      document: 180,
      other: 180,
      ...(cfg?.freshness_rules ?? {}),
    };
    const { data: approved } = await sb
      .from("ai_knowledge_sources")
      .select("id, title, source_type, source_updated_at, last_synced_at, updated_at")
      .eq("status", "approved");
    const now = Date.now();
    for (const r of (approved ?? []) as any[]) {
      const ref = r.source_updated_at ?? r.last_synced_at ?? r.updated_at;
      if (!ref) continue;
      const days = Math.floor((now - new Date(ref).getTime()) / 86400_000);
      const warn = rules[r.source_type] ?? 180;
      if (days > warn * 2) {
        const { data: existing } = await sb
          .from("ai_knowledge_notifications")
          .select("id")
          .eq("notification_type", "source_outdated")
          .eq("status", "open")
          .contains("metadata", { source_id: r.id })
          .maybeSingle();
        if (!existing) {
          await sb.from("ai_knowledge_notifications").insert({
            notification_type: "source_outdated",
            severity: "warning",
            title: `Outdated: ${r.title}`,
            message: `Source has not been refreshed for ${days} days (warning ${warn}).`,
            metadata: { source_id: r.id, source_type: r.source_type, age_days: days },
          });
        }
      }
    }
  } catch {
    // Notifications are best-effort; don't fail the run.
  }

  return { ok: status !== "failed", status, results, run_id: runId };
}