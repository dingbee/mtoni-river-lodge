import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function assertManager(roles: string[]) {
  if (!roles.some((r) => ["owner", "manager"].includes(r))) {
    throw new Error("Forbidden: manager role required.");
  }
}
function assertAdmin(roles: string[]) {
  if (!roles.some((r) => ["owner"].includes(r))) {
    throw new Error("Forbidden: admin role required.");
  }
}
async function getRoles(supabase: any): Promise<string[]> {
  const { data } = await supabase.rpc("current_user_roles");
  return (data ?? []) as string[];
}

/* ---------- Configurations ---------- */

export const listAiConfigurations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_configurations")
      .select("*")
      .order("module", { ascending: true })
      .order("setting_key", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const updateAiConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; setting_value: unknown; description?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase);
    assertManager(roles);
    const { data: existing, error: readErr } = await context.supabase
      .from("ai_configurations").select("version").eq("id", data.id).maybeSingle();
    if (readErr) throw readErr;
    const nextVersion = (existing?.version ?? 1) + 1;
    const { error } = await context.supabase
      .from("ai_configurations")
      .update({
        setting_value: data.setting_value as never,
        description: data.description ?? null,
        version: nextVersion,
        updated_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    await context.supabase.from("ai_activity_logs").insert({
      user_id: context.userId,
      question: `config.update:${data.id}`,
      domains_accessed: ["governance"],
      tool_called: "governance.update_config",
      response: "Configuration updated",
      status: "completed",
      model: "governance",
    });
    return { ok: true, version: nextVersion };
  });

/* ---------- Prompts ---------- */

export const listAiPrompts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase);
    assertManager(roles);
    const { data, error } = await context.supabase
      .from("ai_prompt_versions").select("*")
      .order("module", { ascending: true })
      .order("version", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createAiPromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { module: string; prompt_key: string; prompt_text: string; notes?: string }) => i)
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase);
    assertAdmin(roles);
    const { data: prev } = await context.supabase
      .from("ai_prompt_versions").select("version")
      .eq("module", data.module).eq("prompt_key", data.prompt_key)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const version = (prev?.version ?? 0) + 1;
    const { data: row, error } = await context.supabase
      .from("ai_prompt_versions").insert({
        module: data.module,
        prompt_key: data.prompt_key,
        prompt_text: data.prompt_text,
        version,
        notes: data.notes ?? null,
        created_by: context.userId,
      }).select().single();
    if (error) throw error;
    return row;
  });

export const activateAiPromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase);
    assertAdmin(roles);
    const { data: target, error: e1 } = await context.supabase
      .from("ai_prompt_versions").select("module, prompt_key").eq("id", data.id).single();
    if (e1) throw e1;
    await context.supabase
      .from("ai_prompt_versions")
      .update({ is_active: false })
      .eq("module", target.module).eq("prompt_key", target.prompt_key);
    const { error } = await context.supabase
      .from("ai_prompt_versions")
      .update({ is_active: true, approved_by: context.userId, approved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Feedback ---------- */

export const submitAiFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { activity_log_id?: string | null; module?: string | null; rating: string; comment?: string | null }) => {
    if (!["helpful", "not_helpful", "incorrect", "needs_improvement"].includes(i.rating)) {
      throw new Error("Invalid rating.");
    }
    return i;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ai_feedback").insert({
      activity_log_id: data.activity_log_id ?? null,
      module: data.module ?? null,
      rating: data.rating,
      comment: data.comment ?? null,
      user_id: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listAiFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_feedback").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data ?? [];
  });

/* ---------- Performance / usage ---------- */

export const getAiPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase);
    assertManager(roles);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: logs } = await context.supabase
      .from("ai_activity_logs")
      .select("id, user_id, tool_called, status, duration_ms, created_at, domains_accessed")
      .gte("created_at", since);
    const rows = logs ?? [];
    const totalRequests = rows.length;
    const successful = rows.filter((r) => r.status === "completed").length;
    const failed = totalRequests - successful;
    const avgMs = rows.length
      ? Math.round(rows.reduce((a, r) => a + (r.duration_ms ?? 0), 0) / rows.length)
      : 0;
    const activeUsers = new Set(rows.map((r) => r.user_id)).size;
    const toolCounts: Record<string, number> = {};
    const domainCounts: Record<string, number> = {};
    for (const r of rows) {
      if (r.tool_called) toolCounts[r.tool_called] = (toolCounts[r.tool_called] ?? 0) + 1;
      for (const d of (r.domains_accessed ?? []) as string[]) domainCounts[d] = (domainCounts[d] ?? 0) + 1;
    }
    const topTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);

    const { data: feedback } = await context.supabase
      .from("ai_feedback").select("rating").gte("created_at", since);
    const fbCounts: Record<string, number> = { helpful: 0, not_helpful: 0, incorrect: 0, needs_improvement: 0 };
    for (const f of feedback ?? []) fbCounts[f.rating] = (fbCounts[f.rating] ?? 0) + 1;

    return {
      totalRequests, successful, failed, avgMs, activeUsers,
      topTools, topDomains, feedback: fbCounts,
    };
  });

export const getAiUsageMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase);
    if (!roles.some((r) => ["owner", "manager", "finance"].includes(r))) {
      throw new Error("Forbidden");
    }
    const { data, error } = await context.supabase
      .from("ai_usage_metrics").select("*")
      .order("day", { ascending: false }).limit(90);
    if (error) throw error;
    return data ?? [];
  });

/* ---------- Health ---------- */

export const listAiHealthEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase);
    assertManager(roles);
    const { data, error } = await context.supabase
      .from("ai_health_events").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const resolveAiHealthEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; resolved: boolean }) => i)
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase);
    assertAdmin(roles);
    const { error } = await context.supabase
      .from("ai_health_events").update({ resolved: data.resolved }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Audit explorer ---------- */

export const searchAiAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { module?: string; tool?: string; status?: string; from?: string; to?: string; limit?: number } | undefined) => i ?? {})
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase);
    assertManager(roles);
    let q = context.supabase.from("ai_activity_logs")
      .select("id, user_id, question, domains_accessed, tool_called, response, recommendation, model, status, error, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 100, 500));
    if (data.module) q = q.contains("domains_accessed", [data.module]);
    if (data.tool) q = q.eq("tool_called", data.tool);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ---------- Systems overview ---------- */

export const getAiSystems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getRoles(context.supabase);
    assertManager(roles);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: logs } = await context.supabase
      .from("ai_activity_logs").select("domains_accessed, status, created_at").gte("created_at", since);
    const modules = [
      { id: "command", label: "Command Centre" },
      { id: "executive", label: "Executive Intelligence" },
      { id: "guests", label: "Guest Intelligence" },
      { id: "finance", label: "Revenue Intelligence" },
      { id: "marketing", label: "Marketing Intelligence" },
      { id: "knowledge", label: "Knowledge Base" },
    ];
    return modules.map((m) => {
      const rows = (logs ?? []).filter((r) => (r.domains_accessed ?? []).includes(m.id));
      const failed = rows.filter((r) => r.status !== "completed").length;
      return {
        ...m,
        status: "active" as const,
        requests_7d: rows.length,
        failed_7d: failed,
        health: failed / Math.max(rows.length, 1) > 0.2 ? "warning" : "healthy",
        last_used: rows[0]?.created_at ?? null,
      };
    });
  });

/* ---------- Productisation scope ---------- */

export const getAiScopeContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: orgs } = await context.supabase.from("ai_organisations").select("*");
    const { data: props } = await context.supabase.from("ai_properties").select("*");
    return { organisations: orgs ?? [], properties: props ?? [] };
  });